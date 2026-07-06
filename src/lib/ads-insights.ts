// Agregados de métricas de Meta Ads para el panel /ads — mismo espíritu que
// insights.ts: nunca se le manda el dataset crudo a nada, solo agregados.
// Reexporta el mismo criterio de alto/medio/bajo (terciles) que usan los
// posts orgánicos, para que "alto/medio/bajo" signifique lo mismo en toda la app.
import { band, type MetricBand } from "@/lib/benchmark";
export { bm, BM_COLOR, type MetricBand, type BmLevel } from "@/lib/benchmark";

export type AdInsightRow = {
  campaignId: number;
  campaignName: string;
  campaignStatus: string | null;
  campaignPillarId: number | null;
  date: string; // ISO
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  linkClicks: number | null;
  results: number | null;
  messages: number | null;
};

export type DaySpendPoint = { date: string; spend: number; impressions: number; clicks: number };

export function dailySpend(rows: AdInsightRow[]): DaySpendPoint[] {
  const byDay = new Map<string, DaySpendPoint>();
  for (const r of rows) {
    const key = r.date.slice(0, 10);
    const cur = byDay.get(key) ?? { date: key, spend: 0, impressions: 0, clicks: 0 };
    cur.spend += r.spend ?? 0;
    cur.impressions += r.impressions ?? 0;
    cur.clicks += r.clicks ?? 0;
    byDay.set(key, cur);
  }
  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export type CampaignSummary = {
  campaignId: number;
  name: string;
  status: string | null;
  pillarId: number | null;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  messages: number;
  ctr: number | null; // %
  cpc: number | null;
  cpm: number | null;
  costPerResult: number | null;
};

export function campaignSummaries(rows: AdInsightRow[]): CampaignSummary[] {
  const byCampaign = new Map<number, AdInsightRow[]>();
  for (const r of rows) {
    (byCampaign.get(r.campaignId) ?? byCampaign.set(r.campaignId, []).get(r.campaignId)!).push(r);
  }

  const out: CampaignSummary[] = [];
  for (const [campaignId, rs] of byCampaign) {
    const spend = rs.reduce((s, r) => s + (r.spend ?? 0), 0);
    const impressions = rs.reduce((s, r) => s + (r.impressions ?? 0), 0);
    const clicks = rs.reduce((s, r) => s + (r.clicks ?? 0), 0);
    const results = rs.reduce((s, r) => s + (r.results ?? 0), 0);
    const messages = rs.reduce((s, r) => s + (r.messages ?? 0), 0);
    out.push({
      campaignId,
      name: rs[0].campaignName,
      status: rs[0].campaignStatus,
      pillarId: rs[0].campaignPillarId,
      spend,
      impressions,
      clicks,
      results,
      messages,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
      cpc: clicks > 0 ? spend / clicks : null,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
      costPerResult: results > 0 ? spend / results : null,
    });
  }

  return out.sort((a, b) => b.spend - a.spend);
}

// ── Vista unificada: orgánico + pauta por pilar de contenido ──────────────────
// El cruce que un pro de agencia pide todo el tiempo: "¿la plata que pongo en
// pauta empuja el contenido que ya andaba bien orgánico, o son dos cosas
// separadas?". Se arma juntando el ranking orgánico de pilares (insights.ts)
// con el gasto de campañas ya taggeadas a mano con un pilar.
export type UnifiedPillarRow = {
  pillarId: number;
  label: string;
  organicPosts: number;
  organicReach: number | null;
  organicEr: number | null;
  paidSpend: number;
  paidResults: number;
  paidCostPerResult: number | null;
};

export function unifiedPillarPerformance(
  organicStats: { pillarId: number; label: string; posts: number; alcanceMediano: number | null; erMediana: number | null }[],
  campaigns: CampaignSummary[]
): UnifiedPillarRow[] {
  const byPillar = new Map<number, UnifiedPillarRow>();

  for (const o of organicStats) {
    byPillar.set(o.pillarId, {
      pillarId: o.pillarId,
      label: o.label,
      organicPosts: o.posts,
      organicReach: o.alcanceMediano,
      organicEr: o.erMediana,
      paidSpend: 0,
      paidResults: 0,
      paidCostPerResult: null,
    });
  }

  for (const c of campaigns) {
    if (c.pillarId == null) continue;
    const existing = byPillar.get(c.pillarId);
    if (existing) {
      existing.paidSpend += c.spend;
      existing.paidResults += c.results;
    } else {
      byPillar.set(c.pillarId, {
        pillarId: c.pillarId,
        label: `Pilar #${c.pillarId}`,
        organicPosts: 0,
        organicReach: null,
        organicEr: null,
        paidSpend: c.spend,
        paidResults: c.results,
        paidCostPerResult: null,
      });
    }
  }

  const out = Array.from(byPillar.values());
  for (const row of out) {
    row.paidCostPerResult = row.paidResults > 0 ? row.paidSpend / row.paidResults : null;
  }

  // Solo pilares con alguna señal (orgánica o paga) — no listar los 8 pilares
  // vacíos si todavía no se taggeó ninguna campaña.
  return out
    .filter((r) => r.organicPosts > 0 || r.paidSpend > 0)
    .sort((a, b) => b.paidSpend - a.paidSpend || (b.organicReach ?? 0) - (a.organicReach ?? 0));
}

// ── Anuncios individuales (creativo) ──────────────────────────────────────────
export type AdCreativeRow = {
  adId: number;
  adName: string;
  adStatus: string | null;
  campaignName: string;
  thumbnailUrl: string | null;
  isVideo: boolean;
  metaCreatedAt: string | null;
  date: string; // ISO
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  linkClicks: number | null;
  frequency: number | null; // frecuencia DEL DÍA, no del período — ver adSummaries
  results: number | null;
  messages: number | null;
};

export type AdSummary = {
  adId: number;
  name: string;
  status: string | null;
  campaignName: string;
  thumbnailUrl: string | null;
  isVideo: boolean;
  metaCreatedAt: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  messages: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  costPerResult: number | null;
  frequency: number | null; // aproximada: impresiones / mayor alcance diario del período
};

export function adSummaries(rows: AdCreativeRow[]): AdSummary[] {
  const byAd = new Map<number, AdCreativeRow[]>();
  for (const r of rows) {
    (byAd.get(r.adId) ?? byAd.set(r.adId, []).get(r.adId)!).push(r);
  }

  const out: AdSummary[] = [];
  for (const [adId, rs] of byAd) {
    const spend = rs.reduce((s, r) => s + (r.spend ?? 0), 0);
    const impressions = rs.reduce((s, r) => s + (r.impressions ?? 0), 0);
    const clicks = rs.reduce((s, r) => s + (r.clicks ?? 0), 0);
    const results = rs.reduce((s, r) => s + (r.results ?? 0), 0);
    const messages = rs.reduce((s, r) => s + (r.messages ?? 0), 0);
    // El alcance no se puede sumar entre días (la misma persona puede repetirse) —
    // se usa el máximo diario como piso conservador para una frecuencia aproximada.
    const maxDailyReach = Math.max(0, ...rs.map((r) => r.reach ?? 0));
    out.push({
      adId,
      name: rs[0].adName,
      status: rs[0].adStatus,
      campaignName: rs[0].campaignName,
      thumbnailUrl: rs[0].thumbnailUrl,
      isVideo: rs[0].isVideo,
      metaCreatedAt: rs[0].metaCreatedAt,
      spend,
      impressions,
      clicks,
      results,
      messages,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
      cpc: clicks > 0 ? spend / clicks : null,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
      costPerResult: results > 0 ? spend / results : null,
      frequency: maxDailyReach > 0 ? impressions / maxDailyReach : null,
    });
  }

  return out.sort((a, b) => b.spend - a.spend);
}

// ── Tendencia mensual por anuncio ──────────────────────────────────────────────
// Para responder "¿algún mes empeoró?" — agrupa los daily rows de UN anuncio
// por mes calendario. Necesita rows de un rango largo (ver daysBack en sync.ts).
export type MonthPoint = {
  month: string; // YYYY-MM
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  messages: number;
  ctr: number | null;
  costPerResult: number | null;
};

export function adMonthlyTrend(rows: AdCreativeRow[], adId: number): MonthPoint[] {
  const byMonth = new Map<string, AdCreativeRow[]>();
  for (const r of rows) {
    if (r.adId !== adId) continue;
    const key = r.date.slice(0, 7); // YYYY-MM
    (byMonth.get(key) ?? byMonth.set(key, []).get(key)!).push(r);
  }

  const out: MonthPoint[] = [];
  for (const [month, rs] of byMonth) {
    const spend = rs.reduce((s, r) => s + (r.spend ?? 0), 0);
    const impressions = rs.reduce((s, r) => s + (r.impressions ?? 0), 0);
    const clicks = rs.reduce((s, r) => s + (r.clicks ?? 0), 0);
    const results = rs.reduce((s, r) => s + (r.results ?? 0), 0);
    const messages = rs.reduce((s, r) => s + (r.messages ?? 0), 0);
    out.push({
      month,
      spend,
      impressions,
      clicks,
      results,
      messages,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
      costPerResult: results > 0 ? spend / results : null,
    });
  }

  return out.sort((a, b) => a.month.localeCompare(b.month));
}

// Benchmark de terciles entre los anuncios del propio período (mín. 3) — para
// colorear "alto/medio/bajo" en la grilla igual que se hace con los posts.
export type AdBenchmark = { ctr: MetricBand; cpc: MetricBand; frequency: MetricBand; costPerResult: MetricBand };

export function adBenchmark(ads: AdSummary[]): AdBenchmark {
  const nums = (fn: (a: AdSummary) => number | null) => ads.map(fn).filter((v): v is number => v != null);
  return {
    ctr: band(nums((a) => a.ctr)),
    cpc: band(nums((a) => a.cpc)),
    frequency: band(nums((a) => a.frequency)),
    costPerResult: band(nums((a) => a.costPerResult)),
  };
}
