import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { adInsights, adCreativeInsights, sales, youtubeVideos } from "@/db/schema";
import { median } from "@/lib/benchmark";
import { getConnectedAdAccount } from "@/lib/ads/account-store";
import {
  dailySpend, campaignSummaries, adSummaries, adBenchmark, unifiedPillarPerformance,
  type AdInsightRow, type AdCreativeRow,
} from "@/lib/ads-insights";
import { getUsdRate } from "@/lib/fx";
import { getAnalyticsRows } from "@/lib/analytics-data";
import { pillarPerformance } from "@/lib/insights";
import { AdSpendChart, fmtMoney, fmt, UnifiedPillarTable } from "@/components/AdsPanels";
import { AdsView } from "@/components/AdsView";
import { LogSaleForm } from "@/components/LogSaleForm";
import { AdsAnalysisPanel } from "@/components/AdsAnalysisPanel";
import { PeriodFilter } from "@/components/PeriodFilter";
import { StatDelta } from "@/components/StatDelta";
import { StatLabel } from "@/components/StatLabel";
import { KeyInsights } from "@/components/KeyInsights";
import { buildAdsKeyInsights } from "@/lib/ads-key-insights";

export const dynamic = "force-dynamic";

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const account = await getConnectedAdAccount().catch(() => null);

  if (!account) {
    return (
      <main className="page">
        <div className="card">
          <div className="connect-cta">
            <div className="connect-cta-icon">📢</div>
            <h2>Conectá tu cuenta de Meta Ads</h2>
            <p>Para ver el rendimiento de tu pauta, conectá tu cuenta publicitaria desde Administración.</p>
            <a href="/admin" className="btn btn-primary">Ir a Administración</a>
          </div>
        </div>
      </main>
    );
  }

  const toDate = to ? new Date(to + "T23:59:59") : new Date();
  const fromDate = from ? new Date(from + "T00:00:00") : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  // Ventana anterior del mismo largo, para los deltas de las stat cards.
  const prevWindowFrom = new Date(fromDate.getTime() - (toDate.getTime() - fromDate.getTime()));

  // El historial mensual por anuncio ("¿algún mes empeoró?") tiene que mirar
  // mucho más atrás que el período elegido arriba de la página — si no, con
  // el filtro default de 30 días nunca se ven más de 1-2 meses para comparar.
  const monthlyWindowStart = new Date(toDate.getTime() - 400 * 24 * 60 * 60 * 1000);

  const sameDay = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
  const lastAdsReportAny = await db.query.adAnalysisReports
    .findFirst({ orderBy: (r, { desc }) => [desc(r.createdAt)] })
    .catch(() => null);
  const lastAdsReport =
    lastAdsReportAny && sameDay(lastAdsReportAny.periodFrom, fromDate) && sameDay(lastAdsReportAny.periodTo, toDate)
      ? lastAdsReportAny
      : null;

  const [campaigns, insightRows, prevInsightRows, prevSales, adList, adInsightRows, allAdInsightRows, usdRate, allPillars, organicRows, periodSales] = await Promise.all([
    db.query.adCampaigns.findMany(),
    db.query.adInsights.findMany({
      where: and(gte(adInsights.date, fromDate), lte(adInsights.date, toDate)),
      orderBy: (i, { asc }) => [asc(i.date)],
    }),
    db.query.adInsights.findMany({
      where: and(gte(adInsights.date, prevWindowFrom), lte(adInsights.date, fromDate)),
    }),
    db.query.sales.findMany({
      where: and(gte(sales.occurredAt, prevWindowFrom), lte(sales.occurredAt, fromDate)),
    }).catch(() => []),
    db.query.ads.findMany(),
    db.query.adCreativeInsights.findMany({
      where: and(gte(adCreativeInsights.date, fromDate), lte(adCreativeInsights.date, toDate)),
      orderBy: (i, { asc }) => [asc(i.date)],
    }),
    db.query.adCreativeInsights.findMany({
      where: gte(adCreativeInsights.date, monthlyWindowStart),
      orderBy: (i, { asc }) => [asc(i.date)],
    }),
    getUsdRate(account.currency),
    db.query.pillars.findMany(),
    getAnalyticsRows(fromDate, toDate),
    db.query.sales.findMany({
      where: and(gte(sales.occurredAt, fromDate), lte(sales.occurredAt, toDate)),
    }).catch(() => []),
  ]);

  // YouTube por pilar — para la vista unificada. .catch: hasta que se corra
  // la migración de YouTube estas tablas pueden no existir.
  const [ytVideos, ytMetrics] = await Promise.all([
    db.query.youtubeVideos.findMany({ where: eq(youtubeVideos.status, "PUBLISHED") }).catch(() => []),
    db.query.youtubeVideoMetrics.findMany({ orderBy: (m, { desc }) => [desc(m.capturedAt)] }).catch(() => []),
  ]);
  const latestYt = new Map<number, (typeof ytMetrics)[0]>();
  for (const m of ytMetrics) {
    if (!latestYt.has(m.videoId)) latestYt.set(m.videoId, m);
  }
  const ytByPillar = new Map<number, number[]>();
  for (const v of ytVideos) {
    if (v.pillarId == null) continue;
    const views = latestYt.get(v.id)?.views;
    (ytByPillar.get(v.pillarId) ?? ytByPillar.set(v.pillarId, []).get(v.pillarId)!).push(views ?? 0);
  }
  const ytPillarStats = Array.from(ytByPillar.entries()).map(([pillarId, views]) => ({
    pillarId,
    videos: views.length,
    viewsMedian: median(views.filter((v) => v > 0)),
  }));

  // Todo el gasto se convierte a USD acá, en el único punto de entrada — el
  // resto de la app (gráficos, tablas, grilla) ya trabaja siempre en USD sin
  // saber de conversión. CPC/CPM se recalculan solos a partir de este spend.
  const toUsdOrRaw = (v: number | null) => (v != null && usdRate ? v / usdRate : v);

  const campaignById = new Map(campaigns.map((c) => [c.id, c]));

  const rows: AdInsightRow[] = insightRows.map((i) => {
    const c = campaignById.get(i.campaignId);
    return {
      campaignId: i.campaignId,
      campaignName: c?.name ?? `Campaña #${i.campaignId}`,
      campaignStatus: c?.status ?? null,
      campaignPillarId: c?.pillarId ?? null,
      date: i.date.toISOString(),
      spend: toUsdOrRaw(i.spend),
      impressions: i.impressions,
      reach: i.reach,
      clicks: i.clicks,
      linkClicks: i.linkClicks,
      results: i.results,
      messages: i.messages,
    };
  });

  const spendPoints = dailySpend(rows);
  const campaignStats = campaignSummaries(rows);

  const organicPillarStats = pillarPerformance(organicRows, allPillars);
  const pillarLabelById = new Map(allPillars.map((p) => [p.id, p.label]));
  const unifiedRows = unifiedPillarPerformance(organicPillarStats, campaignStats, ytPillarStats).map((r) => ({
    ...r,
    label: pillarLabelById.get(r.pillarId) ?? r.label,
  }));

  const adById = new Map(adList.map((a) => [a.id, a]));
  const toAdCreativeRow = (i: (typeof adInsightRows)[number]): AdCreativeRow => {
    const a = adById.get(i.adId);
    const campaign = a ? campaignById.get(a.campaignId) : undefined;
    return {
      adId: i.adId,
      adName: a?.name ?? `Anuncio #${i.adId}`,
      adStatus: a?.status ?? null,
      campaignName: campaign?.name ?? "—",
      thumbnailUrl: a?.thumbnailUrl ?? null,
      isVideo: a?.isVideo ?? false,
      metaCreatedAt: a?.metaCreatedAt ? a.metaCreatedAt.toISOString() : null,
      date: i.date.toISOString(),
      spend: toUsdOrRaw(i.spend),
      impressions: i.impressions,
      reach: i.reach,
      clicks: i.clicks,
      linkClicks: i.linkClicks,
      frequency: i.frequency,
      results: i.results,
      messages: i.messages,
    };
  };

  const adRows: AdCreativeRow[] = adInsightRows.map(toAdCreativeRow);
  const adStats = adSummaries(adRows);
  const bench = adBenchmark(adStats);

  // Mismo mapeo que adRows, pero sobre la ventana larga — exclusivamente para
  // alimentar el historial mensual del modal de cada anuncio.
  const allAdRows: AdCreativeRow[] = allAdInsightRows.map(toAdCreativeRow);

  const totalSpend = rows.reduce((s, r) => s + (r.spend ?? 0), 0);
  const totalImpressions = rows.reduce((s, r) => s + (r.impressions ?? 0), 0);
  const totalClicks = rows.reduce((s, r) => s + (r.clicks ?? 0), 0);
  const totalResults = rows.reduce((s, r) => s + (r.results ?? 0), 0);
  const totalMessages = rows.reduce((s, r) => s + (r.messages ?? 0), 0);
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : null;
  const costPerResult = totalResults > 0 ? totalSpend / totalResults : null;

  const totalRevenue = periodSales.reduce((s, r) => s + r.amountUsd, 0);
  const roas = totalSpend > 0 && periodSales.length > 0 ? totalRevenue / totalSpend : null;

  // Totales del período anterior (mismo largo) para los deltas.
  const prevSpend = prevInsightRows.reduce((s, r) => s + (toUsdOrRaw(r.spend) ?? 0), 0);
  const prevImpressions = prevInsightRows.reduce((s, r) => s + (r.impressions ?? 0), 0);
  const prevClicks = prevInsightRows.reduce((s, r) => s + (r.clicks ?? 0), 0);
  const prevResults = prevInsightRows.reduce((s, r) => s + (r.results ?? 0), 0);
  const prevMessages = prevInsightRows.reduce((s, r) => s + (r.messages ?? 0), 0);
  const hasPrev = prevInsightRows.length > 0;
  const prevCtr = prevImpressions > 0 ? (prevClicks / prevImpressions) * 100 : null;
  const prevCpc = prevClicks > 0 ? prevSpend / prevClicks : null;
  const prevCostPerResult = prevResults > 0 ? prevSpend / prevResults : null;
  const prevRevenue = prevSales.reduce((s, r) => s + r.amountUsd, 0);
  const prevRoas = prevSpend > 0 && prevSales.length > 0 ? prevRevenue / prevSpend : null;

  const keyInsights = buildAdsKeyInsights({
    adStats,
    campaignStats,
    unifiedRows,
    adRowsLong: allAdRows,
    spend: totalSpend,
    prevSpend: hasPrev ? prevSpend : null,
    costPerResult,
    prevCostPerResult,
    roas,
  });

  const periodLabel =
    from && to
      ? `${new Date(from).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })} → ${new Date(to).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}`
      : "Últimos 30 días";

  const currencyNote =
    account.currency !== "USD"
      ? usdRate
        ? `Montos convertidos de ${account.currency} a USD (tasa aprox. del día)`
        : `⚠ No se pudo convertir de ${account.currency} a USD — mostrando en ${account.currency}`
      : null;

  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">Meta Ads</h1>
        <p className="page-subtitle">{periodLabel} · {account.label ?? account.adAccountId}</p>
        {currencyNote && (
          <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", marginTop: "0.2rem" }}>{currencyNote}</p>
        )}
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <PeriodFilter />
      </div>

      <KeyInsights insights={keyInsights} />

      <AdsAnalysisPanel
        key={`${from ?? "default"}-${to ?? "default"}`}
        initialSummary={lastAdsReport?.summary ?? null}
        initialCreatedAt={lastAdsReport?.createdAt ? lastAdsReport.createdAt.toISOString() : null}
        from={from}
        to={to}
      />

      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <div className="stat-card">
          <StatLabel label="Inversión" info="Total gastado en Meta Ads en el período, en USD." />
          <div className="stat-value accent">{fmtMoney(totalSpend)}</div>
          <StatDelta curr={totalSpend} prev={hasPrev ? prevSpend : null} neutral />
        </div>
        <div className="stat-card">
          <StatLabel label="Impresiones" info="Veces que se mostraron tus anuncios (una persona puede verlos varias veces)." />
          <div className="stat-value">{fmt(totalImpressions)}</div>
          <StatDelta curr={totalImpressions} prev={hasPrev ? prevImpressions : null} />
        </div>
        <div className="stat-card">
          <StatLabel label="Clics" info="Clics totales en los anuncios. Muchos clics con pocos resultados = la landing/oferta no cierra." />
          <div className="stat-value">{fmt(totalClicks)}</div>
          <StatDelta curr={totalClicks} prev={hasPrev ? prevClicks : null} />
        </div>
        <div className="stat-card">
          <StatLabel label="CTR" info="% de impresiones que hicieron clic. Sano en Meta: 1-2%. Bajo = el creativo no llama la atención." />
          <div className="stat-value">{avgCtr != null ? `${avgCtr.toFixed(2)}%` : "—"}</div>
          <StatDelta curr={avgCtr} prev={prevCtr} />
        </div>
        <div className="stat-card">
          <StatLabel label="CPC" info="Costo por clic. Cuanto más bajo mejor — sube cuando el creativo se gasta o la audiencia se satura." />
          <div className="stat-value">{fmtMoney(avgCpc)}</div>
          <StatDelta curr={avgCpc} prev={prevCpc} invert />
        </div>
        <div className="stat-card">
          <StatLabel label="Resultados" info="Acciones que Meta cuenta como conversión de la campaña (mensajes, leads, etc. según el objetivo)." />
          <div className="stat-value">{totalResults || "—"}</div>
          <StatDelta curr={totalResults || null} prev={prevResults || null} />
        </div>
        <div className="stat-card">
          <StatLabel label="Mensajes" info="Conversaciones iniciadas desde anuncios — el paso previo a la venta en el modelo de Coinbox." />
          <div className="stat-value">{totalMessages || "—"}</div>
          <StatDelta curr={totalMessages || null} prev={prevMessages || null} />
        </div>
        <div className="stat-card">
          <StatLabel label="Costo/resultado" info="Cuánto pagás por cada resultado. LA métrica para comparar campañas — cuanto más baja, mejor." />
          <div className="stat-value">{fmtMoney(costPerResult)}</div>
          <StatDelta curr={costPerResult} prev={prevCostPerResult} invert />
        </div>
        <div className="stat-card">
          <StatLabel label="Ingresos cargados" info="Ventas cargadas a mano en este período. Sin esto no hay ROAS real." />
          <div className="stat-value">{periodSales.length > 0 ? fmtMoney(totalRevenue) : "—"}</div>
          <StatDelta curr={periodSales.length > 0 ? totalRevenue : null} prev={prevSales.length > 0 ? prevRevenue : null} />
        </div>
        <div className="stat-card">
          <StatLabel label="ROAS" info="Retorno de la pauta: ingresos ÷ gasto. 2x = cada dólar invertido devolvió dos. Menos de 1x = pérdida." />
          <div className="stat-value accent">{roas != null ? `${roas.toFixed(1)}x` : "—"}</div>
          <StatDelta curr={roas} prev={prevRoas} />
        </div>
      </div>

      <div style={{ margin: "1.5rem 0" }}>
        <AdSpendChart points={spendPoints} />
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.3rem" }}>Registrar venta</h2>
        <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", marginBottom: "1rem" }}>
          No hay checkout ni pixel que lo detecte solo — cargalo a mano para que el ROAS de arriba sea real, no solo costo por mensaje.
        </p>
        <LogSaleForm campaigns={campaigns.map((c) => ({ campaignId: c.id, name: c.name }))} />
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.3rem" }}>Orgánico + pauta por pilar</h2>
        <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", marginBottom: "1rem" }}>
          Asigná un pilar a cada campaña (abajo, en la tabla de campañas) para ver acá si la plata en pauta empuja el contenido que ya anda bien orgánico.
        </p>
        <UnifiedPillarTable rows={unifiedRows} />
      </div>

      <div className="card">
        <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "1.25rem", color: "var(--text-secondary)" }}>
          {campaignStats.length} campaña{campaignStats.length !== 1 ? "s" : ""} · {adStats.length} anuncio{adStats.length !== 1 ? "s" : ""} · {periodLabel}
        </h2>
        <AdsView campaigns={campaignStats} ads={adStats} bench={bench} adRows={allAdRows} pillars={allPillars} />
      </div>
    </main>
  );
}
