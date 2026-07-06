// Agregados de métricas de Meta Ads para el panel /ads — mismo espíritu que
// insights.ts: nunca se le manda el dataset crudo a nada, solo agregados.

export type AdInsightRow = {
  campaignId: number;
  campaignName: string;
  campaignStatus: string | null;
  date: string; // ISO
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  linkClicks: number | null;
  results: number | null;
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
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
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
    out.push({
      campaignId,
      name: rs[0].campaignName,
      status: rs[0].campaignStatus,
      spend,
      impressions,
      clicks,
      results,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
      cpc: clicks > 0 ? spend / clicks : null,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
      costPerResult: results > 0 ? spend / results : null,
    });
  }

  return out.sort((a, b) => b.spend - a.spend);
}
