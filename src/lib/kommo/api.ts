import { env } from "@/lib/env";

// Wrapper de la API de Kommo (v4) — https://developers.kommo.com/reference
// Integración privada con token de larga duración (sin flujo OAuth): el
// token se genera una sola vez desde la cuenta de Kommo y dura ~1 año.
const BASE = () => `https://${env.kommoSubdomain}.kommo.com/api/v4`;

function headers() {
  return {
    Authorization: `Bearer ${env.kommoAccessToken}`,
    "Content-Type": "application/json",
  };
}

async function kommoGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE()}${path}`, { headers: headers(), signal: AbortSignal.timeout(15000) });
  // Kommo devuelve 204 (sin cuerpo) cuando una lista no tiene resultados para
  // esa página/filtro — NO es un error, es "vacío". Tratar de hacer .json()
  // sobre un 204 explota, así que se corta acá.
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Error de Kommo (${res.status}) en ${path}: ${JSON.stringify(body)}`);
  }
  return body;
}

export type KommoPipelineStatus = { id: number; name: string; sort: number; color: string | null };
export type KommoPipeline = { id: number; name: string; sort: number; isMain: boolean; statuses: KommoPipelineStatus[] };

export async function getPipelines(): Promise<KommoPipeline[]> {
  const body = (await kommoGet("/leads/pipelines")) as {
    _embedded?: { pipelines?: Array<{ id: number; name: string; sort: number; is_main?: boolean; _embedded?: { statuses?: KommoPipelineStatus[] } }> };
  } | null;
  const pipelines = body?._embedded?.pipelines ?? [];
  return pipelines.map((p) => ({
    id: p.id,
    name: p.name,
    sort: p.sort,
    isMain: p.is_main ?? false,
    statuses: (p._embedded?.statuses ?? []).sort((a, b) => a.sort - b.sort),
  }));
}

export type KommoFieldEnum = { id: number; value: string; sort: number };
export type KommoCustomField = { id: number; name: string; type: string; enums: KommoFieldEnum[] };

// Tipos de campo que tienen sentido para un desglose por %: el resto
// (texto libre, fecha, número, etc.) no tiene "valores" fijos para agrupar.
const BREAKDOWN_FIELD_TYPES = new Set(["select", "radiobutton", "multiselect"]);

export async function getLeadsCustomFields(): Promise<KommoCustomField[]> {
  const out: KommoCustomField[] = [];
  let page = 1;
  // Tope de seguridad — una cuenta normal tiene unas pocas decenas de campos.
  while (page <= 10) {
    const body = (await kommoGet(`/leads/custom_fields?page=${page}&limit=250`)) as {
      _embedded?: { custom_fields?: Array<{ id: number; name: string; type: string; enums?: KommoFieldEnum[] }> };
    } | null;
    const fields = body?._embedded?.custom_fields ?? [];
    if (fields.length === 0) break;
    for (const f of fields) {
      if (BREAKDOWN_FIELD_TYPES.has(f.type)) {
        out.push({ id: f.id, name: f.name, type: f.type, enums: f.enums ?? [] });
      }
    }
    if (fields.length < 250) break;
    page++;
  }
  return out;
}

export type KommoLeadRaw = {
  id: number;
  name: string | null;
  price: number | null;
  pipeline_id: number | null;
  status_id: number | null;
  responsible_user_id: number | null;
  created_at: number | null; // unix seconds
  updated_at: number | null;
  closed_at: number | null;
  loss_reason_id: number | null; // solo presente en leads perdidos
  source_id?: number | null; // con `with=source_id` — de qué fuente (canal) entró
  custom_fields_values: Array<{
    field_id: number;
    field_name: string;
    field_type: string;
    values: Array<{ value: string | number | null; enum_id?: number | null }>;
  }> | null;
};

// Trae los leads creados en el rango [from, to) — pagina hasta que Kommo deja
// de devolver resultados (204). `limit:250` es el máximo que permite la API
// por página. Ordenado del MÁS NUEVO al más viejo: si se llega al tope de
// páginas, lo que queda afuera es lo más antiguo, nunca lo de esta semana
// (antes era al revés y con 12.500+ leads se perdían justo los recientes).
export async function getLeadsCreatedBetween(from: Date, to: Date, maxPages = 400): Promise<KommoLeadRaw[]> {
  const fromUnix = Math.floor(from.getTime() / 1000);
  const toUnix = Math.floor(to.getTime() / 1000);
  const out: KommoLeadRaw[] = [];
  let page = 1;
  while (page <= maxPages) {
    const body = (await kommoGet(
      `/leads?filter[created_at][from]=${fromUnix}&filter[created_at][to]=${toUnix}&page=${page}&limit=250&order[created_at]=desc&with=source_id`,
    )) as { _embedded?: { leads?: KommoLeadRaw[] } } | null;
    const leads = body?._embedded?.leads ?? [];
    if (leads.length === 0) break;
    out.push(...leads);
    if (leads.length < 250) break;
    page++;
  }
  if (page > maxPages) console.warn(`Kommo: se alcanzó el tope de ${maxPages} páginas — quedaron afuera los leads más viejos del rango.`);
  // Si entra un lead nuevo mientras se pagina, todo se corre un lugar y el
  // mismo lead aparece en dos páginas seguidas. Se deduplica por id (el
  // upsert en tanda falla si un id se repite dentro del mismo INSERT).
  return Array.from(new Map(out.map((l) => [l.id, l])).values());
}

export type KommoChannel = "whatsapp" | "instagram" | "facebook" | "otro";

// `origin` de un chat de Kommo → canal legible. waba = WhatsApp Business API,
// com.amocrm.amocrmwa = WhatsApp Lite, instagram_business = DMs de IG.
export function channelFromOrigin(origin: string | null | undefined): KommoChannel | null {
  if (!origin) return null;
  const o = origin.toLowerCase();
  if (o.includes("waba") || o.includes("whatsapp") || o.endsWith("wa")) return "whatsapp";
  if (o.includes("instagram")) return "instagram";
  if (o.includes("facebook") || o.includes("messenger")) return "facebook";
  return "otro";
}

// Canal de entrada de cada lead. Kommo no lo trae en el lead en sí, pero
// cada chat (/talks) tiene `origin` (whatsapp/instagram), el lead al que
// pertenece y el `source_id` de la fuente. Se arman dos mapas: por lead
// (exacto) y por fuente (para leads cuyo chat no entró en las páginas
// leídas — cada fuente es siempre del mismo canal).
export async function getChannelMaps(maxPages = 40): Promise<{ byLead: Map<string, KommoChannel>; bySource: Map<string, KommoChannel> }> {
  const byLead = new Map<string, KommoChannel>();
  const bySource = new Map<string, KommoChannel>();
  for (let page = 1; page <= maxPages; page++) {
    const body = (await kommoGet(`/talks?page=${page}&limit=250`)) as {
      _embedded?: { talks?: Array<{ origin?: string; source_id?: number; entity_id?: number; entity_type?: string }> };
    } | null;
    const talks = body?._embedded?.talks ?? [];
    for (const t of talks) {
      const channel = channelFromOrigin(t.origin);
      if (!channel) continue;
      if (t.source_id != null) bySource.set(String(t.source_id), channel);
      if (t.entity_type === "lead" && t.entity_id != null) byLead.set(String(t.entity_id), channel);
    }
    if (talks.length < 250) break;
  }
  return { byLead, bySource };
}

export type KommoUser = { id: number; name: string };

// Para resolver "responsible_user_id" → nombre en el ranking de vendedores.
export async function getUsers(): Promise<KommoUser[]> {
  const out: KommoUser[] = [];
  let page = 1;
  while (page <= 10) {
    const body = (await kommoGet(`/users?page=${page}&limit=250`)) as {
      _embedded?: { users?: Array<{ id: number; name: string }> };
    } | null;
    const users = body?._embedded?.users ?? [];
    if (users.length === 0) break;
    out.push(...users.map((u) => ({ id: u.id, name: u.name })));
    if (users.length < 250) break;
    page++;
  }
  return out;
}

export type KommoLossReason = { id: number; name: string };

// Para resolver "loss_reason_id" → texto en "Motivos de pérdida".
export async function getLossReasons(): Promise<KommoLossReason[]> {
  const body = (await kommoGet("/leads/loss_reasons")) as {
    _embedded?: { loss_reasons?: Array<{ id: number; name: string }> };
  } | null;
  return (body?._embedded?.loss_reasons ?? []).map((r) => ({ id: r.id, name: r.name }));
}
