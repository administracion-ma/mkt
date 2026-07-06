// Agregados de pauta para el informe de IA — mismo espíritu que
// analysis-payload.ts: nunca se manda el dataset crudo, solo agregados ya
// calculados (los mismos que arma /ads para la vista).
import { and, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { adInsights, adCreativeInsights, sales } from "@/db/schema";
import {
  dailySpend, campaignSummaries, adSummaries, adMonthlyTrend, unifiedPillarPerformance,
  type AdInsightRow, type AdCreativeRow,
} from "@/lib/ads-insights";
import { getUsdRate } from "@/lib/fx";
import { getAnalyticsRows } from "@/lib/analytics-data";
import { pillarPerformance } from "@/lib/insights";
import { getConnectedAdAccount } from "@/lib/ads/account-store";

function pct(n: number | null): string | null {
  return n != null ? `${n.toFixed(2)}%` : null;
}

export async function buildAdsAnalysisPayload(from: Date, to: Date) {
  const account = await getConnectedAdAccount().catch(() => null);
  if (!account) return null;

  const [campaigns, insightRows, adList, adInsightRows, usdRate, allPillars, organicRows, periodSales] = await Promise.all([
    db.query.adCampaigns.findMany(),
    db.query.adInsights.findMany({ where: and(gte(adInsights.date, from), lte(adInsights.date, to)) }),
    db.query.ads.findMany(),
    db.query.adCreativeInsights.findMany({ where: and(gte(adCreativeInsights.date, from), lte(adCreativeInsights.date, to)) }),
    getUsdRate(account.currency),
    db.query.pillars.findMany(),
    getAnalyticsRows(from, to),
    db.query.sales.findMany({ where: and(gte(sales.occurredAt, from), lte(sales.occurredAt, to)) }).catch(() => []),
  ]);

  if (insightRows.length === 0) return null;

  const toUsdOrRaw = (v: number | null) => (v != null && usdRate ? v / usdRate : v);
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const adById = new Map(adList.map((a) => [a.id, a]));

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

  const adRows: AdCreativeRow[] = adInsightRows.map((i) => {
    const a = adById.get(i.adId);
    const campaign = a ? campaignById.get(a.campaignId) : undefined;
    return {
      adId: i.adId,
      adName: a?.name ?? `Anuncio #${i.adId}`,
      adStatus: a?.status ?? null,
      campaignName: campaign?.name ?? "—",
      thumbnailUrl: null,
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
  });

  const campaignStats = campaignSummaries(rows);
  const adStats = adSummaries(adRows);
  const organicPillarStats = pillarPerformance(organicRows, allPillars);
  const unifiedRows = unifiedPillarPerformance(organicPillarStats, campaignStats);
  const spendPoints = dailySpend(rows);

  const totalSpend = rows.reduce((s, r) => s + (r.spend ?? 0), 0);
  const totalResults = rows.reduce((s, r) => s + (r.results ?? 0), 0);
  const totalRevenue = periodSales.reduce((s, r) => s + r.amountUsd, 0);

  // Diagnóstico por anuncio: fatiga + variación de costo/resultado mes a mes,
  // igual que el banner que ve el usuario en la grilla — así la IA razona
  // sobre la misma señal, no una versión distinta.
  const adDiagnoses = adStats.map((ad) => {
    const months = adMonthlyTrend(adRows, ad.adId);
    const last = months[months.length - 1];
    const prev = months[months.length - 2];
    const worsening = last?.costPerResult != null && prev?.costPerResult != null && last.costPerResult > prev.costPerResult * 1.1;
    const fatigued = ad.frequency != null && ad.frequency >= 4;
    return {
      anuncio: ad.name,
      campaña: ad.campaignName,
      gasto: ad.spend,
      costo_por_resultado: ad.costPerResult,
      frecuencia: ad.frequency,
      fatiga: fatigued,
      costo_empeorando: worsening,
    };
  });

  return {
    periodo: { desde: from.toISOString().slice(0, 10), hasta: to.toISOString().slice(0, 10) },
    moneda_cuenta: account.currency,
    resumen: {
      gasto_total_usd: totalSpend,
      resultados_totales: totalResults,
      costo_por_resultado: totalResults > 0 ? totalSpend / totalResults : null,
      ingresos_cargados_usd: periodSales.length > 0 ? totalRevenue : null,
      roas: periodSales.length > 0 && totalSpend > 0 ? totalRevenue / totalSpend : null,
    },
    gasto_semanal: spendPoints.map((p) => ({ semana: p.date, gasto: p.spend })),
    campañas: campaignStats.map((c) => ({
      nombre: c.name,
      estado: c.status,
      gasto: c.spend,
      ctr: pct(c.ctr),
      costo_por_resultado: c.costPerResult,
      mensajes: c.messages,
    })),
    anuncios: adDiagnoses,
    orgánico_mas_pauta_por_pilar: unifiedRows.map((r) => ({
      pilar: r.label,
      posts_organicos: r.organicPosts,
      alcance_organico_mediano: r.organicReach,
      er_organico: pct(r.organicEr != null ? r.organicEr * 100 : null),
      gasto_pauta: r.paidSpend || null,
      costo_por_resultado_pauta: r.paidCostPerResult,
    })),
  };
}

export type AdsAnalysisPayload = NonNullable<Awaited<ReturnType<typeof buildAdsAnalysisPayload>>>;
