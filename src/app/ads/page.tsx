import { and, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { adInsights } from "@/db/schema";
import { getConnectedAdAccount } from "@/lib/ads/account-store";
import { dailySpend, campaignSummaries, type AdInsightRow } from "@/lib/ads-insights";
import { AdSpendChart, CampaignTable } from "@/components/AdsPanels";
import { PeriodFilter } from "@/components/PeriodFilter";

export const dynamic = "force-dynamic";

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: n >= 1000 ? 0 : 2 })}`;
}
function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

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

  const [campaigns, insightRows] = await Promise.all([
    db.query.adCampaigns.findMany(),
    db.query.adInsights.findMany({
      where: and(gte(adInsights.date, fromDate), lte(adInsights.date, toDate)),
      orderBy: (i, { asc }) => [asc(i.date)],
    }),
  ]);

  const campaignById = new Map(campaigns.map((c) => [c.id, c]));

  const rows: AdInsightRow[] = insightRows.map((i) => {
    const c = campaignById.get(i.campaignId);
    return {
      campaignId: i.campaignId,
      campaignName: c?.name ?? `Campaña #${i.campaignId}`,
      campaignStatus: c?.status ?? null,
      date: i.date.toISOString(),
      spend: i.spend,
      impressions: i.impressions,
      reach: i.reach,
      clicks: i.clicks,
      linkClicks: i.linkClicks,
      results: i.results,
    };
  });

  const spendPoints = dailySpend(rows);
  const campaignStats = campaignSummaries(rows);

  const totalSpend = rows.reduce((s, r) => s + (r.spend ?? 0), 0);
  const totalImpressions = rows.reduce((s, r) => s + (r.impressions ?? 0), 0);
  const totalClicks = rows.reduce((s, r) => s + (r.clicks ?? 0), 0);
  const totalResults = rows.reduce((s, r) => s + (r.results ?? 0), 0);
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : null;
  const costPerResult = totalResults > 0 ? totalSpend / totalResults : null;

  const periodLabel =
    from && to
      ? `${new Date(from).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })} → ${new Date(to).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}`
      : "Últimos 30 días";

  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">Meta Ads</h1>
        <p className="page-subtitle">{periodLabel} · {account.label ?? account.adAccountId}</p>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <PeriodFilter />
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <div className="stat-card">
          <div className="stat-label">Inversión</div>
          <div className="stat-value accent">{fmtMoney(totalSpend)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Impresiones</div>
          <div className="stat-value">{fmt(totalImpressions)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Clics</div>
          <div className="stat-value">{fmt(totalClicks)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">CTR</div>
          <div className="stat-value">{avgCtr != null ? `${avgCtr.toFixed(2)}%` : "—"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">CPC</div>
          <div className="stat-value">{fmtMoney(avgCpc)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Resultados</div>
          <div className="stat-value">{totalResults || "—"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Costo/resultado</div>
          <div className="stat-value">{fmtMoney(costPerResult)}</div>
        </div>
      </div>

      <div style={{ margin: "1.5rem 0" }}>
        <AdSpendChart points={spendPoints} />
      </div>

      <div className="card">
        <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "1.25rem", color: "var(--text-secondary)" }}>
          {campaignStats.length} campaña{campaignStats.length !== 1 ? "s" : ""} · {periodLabel}
        </h2>
        <CampaignTable campaigns={campaignStats} />
      </div>
    </main>
  );
}
