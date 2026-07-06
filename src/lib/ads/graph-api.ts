import { env } from "@/lib/env";

const BASE = `https://graph.facebook.com/${env.metaGraphApiVersion}`;

async function adsGet<T>(path: string, params: Record<string, string>, revalidateSeconds?: number): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString(), revalidateSeconds != null ? { next: { revalidate: revalidateSeconds } } : undefined);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Meta Ads API error en ${path}: ${JSON.stringify(body)}`);
  }
  return body as T;
}

interface PagedResponse<TRow> {
  data: TRow[];
  paging?: { next?: string };
}

// Sigue paging.next hasta agotar resultados — necesario para ventanas largas
// (ej. 90 días × varios anuncios puede superar el límite de una sola página).
async function adsGetAllPages<TRow>(path: string, params: Record<string, string>): Promise<TRow[]> {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const rows: TRow[] = [];
  let nextUrl: string | undefined = url.toString();
  while (nextUrl) {
    const res: Response = await fetch(nextUrl);
    const body: PagedResponse<TRow> = await res.json();
    if (!res.ok) {
      throw new Error(`Meta Ads API error en ${path}: ${JSON.stringify(body)}`);
    }
    rows.push(...(body.data ?? []));
    nextUrl = body.paging?.next;
  }
  return rows;
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

export type RawAction = { action_type: string; value: string };

// "Resultados" = suma de TODAS las acciones que reporta Meta (leads, mensajes,
// compras, etc.) — aproximación genérica. "Mensajes" filtra específicamente
// las acciones de conversación (útil para campañas de objetivo Mensajes/WhatsApp).
// null solo si Meta no mandó el campo actions; si lo mandó vacío, es 0 real.
function sumActions(actions: RawAction[] | undefined, matcher?: (type: string) => boolean): number | null {
  if (actions == null) return null;
  const filtered = matcher ? actions.filter((a) => matcher(a.action_type)) : actions;
  return filtered.reduce((s, a) => s + Number(a.value || 0), 0);
}
const isMessagingAction = (type: string) => type.includes("messaging");

interface RawInsightFields {
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  frequency?: string;
  actions?: RawAction[];
}

const num = (v?: string) => (v != null && v !== "" ? Number(v) : null);

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
  messages: number | null;
  actions: RawAction[] | null; // crudo, para poder sumar por tipo de acción a futuro sin re-pedir historial
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
  const rows = await adsGetAllPages<RawInsightFields & { campaign_id: string; date_start: string }>(
    `/${adAccountId}/insights`,
    {
      level: "campaign",
      time_increment: "1",
      time_range: JSON.stringify({ since, until }),
      fields: "campaign_id,spend,impressions,reach,clicks,inline_link_clicks,cpc,cpm,ctr,actions",
      limit: "500",
      access_token: accessToken,
    }
  );

  return rows.map((row) => ({
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
    results: sumActions(row.actions),
    messages: sumActions(row.actions, isMessagingAction),
    actions: row.actions ?? null,
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

export interface AdMeta {
  id: string;
  name: string;
  status: string;
  campaignId: string;
  creativeId: string | null;
  thumbnailUrl: string | null;
  isVideo: boolean;
  metaCreatedAt: string | null; // fecha real en que se creó el anuncio en Meta
}

// Metadata + creativo de cada anuncio individual — para poder mostrar la
// miniatura/video real y no solo agregados por campaña.
export async function getAds(adAccountId: string, accessToken: string): Promise<AdMeta[]> {
  const data = await adsGet<{
    data: Array<{
      id: string;
      name: string;
      status: string;
      campaign_id: string;
      created_time?: string;
      creative?: { id?: string; thumbnail_url?: string; video_id?: string };
    }>;
  }>(`/${adAccountId}/ads`, {
    fields: "id,name,status,campaign_id,created_time,creative{id,thumbnail_url,video_id}",
    limit: "300",
    access_token: accessToken,
  });

  return data.data.map((a) => ({
    id: a.id,
    name: a.name,
    status: a.status,
    campaignId: a.campaign_id,
    creativeId: a.creative?.id ?? null,
    thumbnailUrl: a.creative?.thumbnail_url ?? null,
    isVideo: !!a.creative?.video_id,
    metaCreatedAt: a.created_time ?? null,
  }));
}

export interface DailyAdInsight {
  adId: string;
  date: string;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  linkClicks: number | null;
  cpc: number | null;
  cpm: number | null;
  ctr: number | null;
  frequency: number | null;
  results: number | null;
  messages: number | null;
  actions: RawAction[] | null;
}

// level=ad + time_increment=1: desglose diario de TODOS los anuncios de la
// cuenta en una sola llamada. La frecuencia que devuelve acá es "del día", no
// del período completo — ads-insights.ts la aproxima al agregar.
export async function getDailyAdInsights(
  adAccountId: string,
  accessToken: string,
  since: string,
  until: string
): Promise<DailyAdInsight[]> {
  const rows = await adsGetAllPages<RawInsightFields & { ad_id: string; date_start: string }>(
    `/${adAccountId}/insights`,
    {
      level: "ad",
      time_increment: "1",
      time_range: JSON.stringify({ since, until }),
      fields: "ad_id,spend,impressions,reach,clicks,inline_link_clicks,cpc,cpm,ctr,frequency,actions",
      limit: "500",
      access_token: accessToken,
    }
  );

  return rows.map((row) => ({
    adId: row.ad_id,
    date: row.date_start,
    spend: num(row.spend),
    impressions: num(row.impressions),
    reach: num(row.reach),
    clicks: num(row.clicks),
    linkClicks: num(row.inline_link_clicks),
    cpc: num(row.cpc),
    cpm: num(row.cpm),
    ctr: num(row.ctr),
    frequency: num(row.frequency),
    results: sumActions(row.actions),
    messages: sumActions(row.actions, isMessagingAction),
    actions: row.actions ?? null,
  }));
}

// El thumbnail_url del creativo es una URL firmada que expira, igual que los
// media_url de Instagram — se pide fresco en vez de confiar en el guardado.
export async function getFreshCreativeThumbnail(creativeId: string, accessToken: string): Promise<string | null> {
  const data = await adsGet<{ thumbnail_url?: string }>(
    `/${creativeId}`,
    {
      fields: "thumbnail_url",
      // Sin esto Meta devuelve una miniatura chica (pensada para listados,
      // no para un preview grande) — se pide explícitamente a mayor resolución.
      thumbnail_width: "640",
      thumbnail_height: "640",
      access_token: accessToken,
    },
    1800
  );
  return data.thumbnail_url ?? null;
}
