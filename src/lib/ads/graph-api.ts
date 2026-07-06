import { env } from "@/lib/env";

const BASE = `https://graph.facebook.com/${env.metaGraphApiVersion}`;

async function adsGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString());
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Meta Ads API error en ${path}: ${JSON.stringify(body)}`);
  }
  return body as T;
}

export interface AdCampaign {
  id: string;
  name: string;
  objective?: string;
  status: string;
}

export async function getCampaigns(adAccountId: string, accessToken: string): Promise<AdCampaign[]> {
  const data = await adsGet<{ data: AdCampaign[] }>(`/${adAccountId}/campaigns`, {
    fields: "id,name,objective,status",
    limit: "200",
    access_token: accessToken,
  });
  return data.data;
}

export interface DailyCampaignInsight {
  campaignId: string;
  date: string; // YYYY-MM-DD
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  linkClicks: number | null;
  cpc: number | null;
  cpm: number | null;
  ctr: number | null;
  results: number | null;
}

// level=campaign + time_increment=1 trae, en una sola llamada, el desglose
// diario de TODAS las campañas de la cuenta — evita pedir insight por
// insight por campaña por día (y comer rate limit innecesariamente).
export async function getDailyCampaignInsights(
  adAccountId: string,
  accessToken: string,
  since: string,
  until: string
): Promise<DailyCampaignInsight[]> {
  const num = (v?: string) => (v != null && v !== "" ? Number(v) : null);

  const data = await adsGet<{
    data: Array<{
      campaign_id: string;
      date_start: string;
      spend?: string;
      impressions?: string;
      reach?: string;
      clicks?: string;
      inline_link_clicks?: string;
      cpc?: string;
      cpm?: string;
      ctr?: string;
      actions?: Array<{ action_type: string; value: string }>;
    }>;
  }>(`/${adAccountId}/insights`, {
    level: "campaign",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    fields: "campaign_id,spend,impressions,reach,clicks,inline_link_clicks,cpc,cpm,ctr,actions",
    limit: "500",
    access_token: accessToken,
  });

  return data.data.map((row) => ({
    campaignId: row.campaign_id,
    date: row.date_start,
    spend: num(row.spend),
    impressions: num(row.impressions),
    reach: num(row.reach),
    clicks: num(row.clicks),
    linkClicks: num(row.inline_link_clicks),
    cpc: num(row.cpc),
    cpm: num(row.cpm),
    ctr: num(row.ctr),
    // "resultados" = suma de todas las acciones que reporta Meta (leads, mensajes,
    // compras, etc.) — una aproximación genérica, no distingue por objetivo.
    results: row.actions?.length ? row.actions.reduce((sum, a) => sum + Number(a.value || 0), 0) : null,
  }));
}

// Valida el token/cuenta antes de guardarlo — evita guardar credenciales rotas
// sin darse cuenta hasta el próximo sync.
export async function verifyAdAccount(adAccountId: string, accessToken: string): Promise<{ name: string; currency: string }> {
  const data = await adsGet<{ name: string; currency: string }>(`/${adAccountId}`, {
    fields: "name,currency",
    access_token: accessToken,
  });
  return data;
}
