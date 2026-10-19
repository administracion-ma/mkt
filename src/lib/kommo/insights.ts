import type { kommoLeads } from "@/db/schema";
import type { KommoCustomField, KommoLossReason, KommoPipeline, KommoUser } from "@/lib/kommo/api";

export type KommoLeadRow = typeof kommoLeads.$inferSelect;

// IDs de etapa reservados por Kommo — TODOS los pipelines los tienen,
// cualquiera sea el nombre que le pusieron en español ("Leads ganados" /
// "Leads perdidos" en esta cuenta). Es la convención estándar de la API de
// Kommo/amoCRM, no algo configurado por nosotros.
export const WON_STATUS_ID = "142";
export const LOST_STATUS_ID = "143";

function firstOpenStage(pipeline: KommoPipeline | null) {
  return pipeline?.statuses.find((s) => String(s.id) !== WON_STATUS_ID && String(s.id) !== LOST_STATUS_ID) ?? null;
}

// Primera etapa abierta de CADA pipeline ("Leads Entrantes"). La cuenta tiene
// varios pipelines y cada lead se compara contra el suyo — antes se usaba
// solo el principal y los leads de "Filtrado" (la mayoría) contaban mal.
export function firstStageByPipeline(pipelines: KommoPipeline[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of pipelines) {
    const stage = firstOpenStage(p);
    if (stage) map.set(String(p.id), String(stage.id));
  }
  return map;
}

// ¿El lead sigue en la primera etapa de su pipeline (nadie lo movió)?
function isUntouched(l: { pipelineId: string | null; statusId: string | null }, firstStages: Map<string, string>) {
  return l.pipelineId != null && firstStages.get(l.pipelineId) === l.statusId;
}

export type FunnelStageRow = { statusId: string; label: string; color: string | null; count: number; pct: number };

// Distribución de leads por etapa ACTUAL del pipeline, sobre los leads
// creados en el período elegido — no es un embudo de cohorte (no rastrea en
// qué etapas estuvo cada lead a lo largo del tiempo, eso requeriría la API de
// eventos de Kommo), pero responde la pregunta más común: "de lo que entró
// este mes, dónde está parado hoy".
export function leadsFunnel(leads: KommoLeadRow[], pipeline: KommoPipeline): FunnelStageRow[] {
  const total = leads.length;
  const counts = new Map<string, number>();
  for (const l of leads) {
    if (!l.statusId) continue;
    counts.set(l.statusId, (counts.get(l.statusId) ?? 0) + 1);
  }
  return pipeline.statuses.map((s) => {
    const count = counts.get(String(s.id)) ?? 0;
    return {
      statusId: String(s.id),
      label: s.name,
      color: s.color,
      count,
      pct: total > 0 ? (count / total) * 100 : 0,
    };
  });
}

export type FieldBreakdownRow = { value: string; count: number; pct: number };
export type FieldBreakdown = {
  fieldId: number;
  fieldName: string;
  fieldType: string;
  rows: FieldBreakdownRow[];
  answeredCount: number;
  totalCount: number;
};

// % de leads del período por cada valor de un campo de selección (p.ej.
// "tipo de interés", "capital"). En multiselect un mismo lead puede sumar a
// más de un valor, así que el total de % puede pasar el 100% — es esperable,
// no un bug (se nota con answeredCount vs totalCount en vez de forzar a 100).
export function customFieldBreakdown(leads: KommoLeadRow[], field: KommoCustomField): FieldBreakdown {
  const total = leads.length;
  const enumById = new Map(field.enums.map((e) => [e.id, e.value]));
  const counts = new Map<string, number>();
  let answered = 0;

  for (const l of leads) {
    const cf = (l.customFields ?? []).find((f) => f.fieldId === field.id);
    if (!cf || cf.values.length === 0) continue;
    answered++;
    for (const v of cf.values) {
      const label = v.enumId != null ? enumById.get(v.enumId) ?? String(v.value ?? "?") : String(v.value ?? "?");
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  const rows = Array.from(counts.entries())
    .map(([value, count]) => ({ value, count, pct: total > 0 ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count);

  return { fieldId: field.id, fieldName: field.name, fieldType: field.type, rows, answeredCount: answered, totalCount: total };
}

export type PipelineTotals = {
  total: number;
  contacted: number; // no están en la primera etapa del pipeline (= tuvieron algún movimiento)
  won: number;
  lost: number;
  closeRate: number | null; // ganados / (ganados + perdidos)
  responseRate: number | null; // avanzados / total
};

export type StatusCount = { pipelineId: string | null; statusId: string | null; count: number };

// Totales de todo el histórico (no acotado al período) — "cómo viene el
// pipeline en general", la foto completa más allá de lo que entró este mes.
// Recibe conteos por pipeline+etapa (un GROUP BY en la base) en vez de los
// leads: el histórico son decenas de miles de filas.
export function pipelineTotals(counts: StatusCount[], pipelines: KommoPipeline[]): PipelineTotals {
  const firstStages = firstStageByPipeline(pipelines);
  let total = 0, won = 0, lost = 0, contacted = 0;
  for (const c of counts) {
    total += c.count;
    if (c.statusId === WON_STATUS_ID) won += c.count;
    if (c.statusId === LOST_STATUS_ID) lost += c.count;
    if (!isUntouched(c, firstStages)) contacted += c.count;
  }
  return {
    total,
    contacted,
    won,
    lost,
    closeRate: won + lost > 0 ? (won / (won + lost)) * 100 : null,
    responseRate: total > 0 ? (contacted / total) * 100 : null,
  };
}

export type ConcretionStep = { label: string; count: number };
export type Concretion = { steps: ConcretionStep[]; rate: number | null };

// Mini-embudo de 3 pasos del período — "de lo que entró, cuánto avanzó y
// cuánto se cerró". A diferencia del embudo completo (una fila por etapa),
// esto da el pulso rápido en 3 números grandes, arriba de todo.
export function concretionFunnel(leads: KommoLeadRow[], pipelines: KommoPipeline[]): Concretion {
  const total = leads.length;
  const firstStages = firstStageByPipeline(pipelines);
  const inProgress = leads.filter((l) => !isUntouched(l, firstStages)).length;
  const won = leads.filter((l) => l.statusId === WON_STATUS_ID).length;
  return {
    steps: [
      { label: "Leads entrantes", count: total },
      { label: "En proceso", count: inProgress },
      { label: "Ganados", count: won },
    ],
    rate: total > 0 ? (won / total) * 100 : null,
  };
}

export type LeaderboardRow = {
  userId: string;
  name: string;
  contacted: number;
  won: number;
  closeRate: number | null;
};

// Ranking de vendedores (responsible_user_id de Kommo) por leads del período
// que les tocaron. Ordenado por cierres — el que más vendió arriba.
export function salesLeaderboard(leads: KommoLeadRow[], users: KommoUser[], pipelines: KommoPipeline[]): LeaderboardRow[] {
  const nameById = new Map(users.map((u) => [String(u.id), u.name]));
  const firstStages = firstStageByPipeline(pipelines);
  const byUser = new Map<string, { contacted: number; won: number }>();

  for (const l of leads) {
    if (!l.responsibleUserId) continue;
    const entry = byUser.get(l.responsibleUserId) ?? { contacted: 0, won: 0 };
    if (!isUntouched(l, firstStages)) entry.contacted++;
    if (l.statusId === WON_STATUS_ID) entry.won++;
    byUser.set(l.responsibleUserId, entry);
  }

  return Array.from(byUser.entries())
    .map(([userId, v]) => ({
      userId,
      name: nameById.get(userId) ?? `Usuario #${userId}`,
      contacted: v.contacted,
      won: v.won,
      closeRate: v.contacted > 0 ? (v.won / v.contacted) * 100 : null,
    }))
    .sort((a, b) => b.won - a.won);
}

export type LossReasonRow = { reason: string; count: number; pct: number };

// Desglose de por qué se perdieron los leads del período — Kommo guarda el
// motivo como un ID de una lista configurable en la cuenta (/leads/loss_reasons).
export function lossReasonsBreakdown(leads: KommoLeadRow[], reasons: KommoLossReason[]): LossReasonRow[] {
  const nameById = new Map(reasons.map((r) => [String(r.id), r.name]));
  const lost = leads.filter((l) => l.statusId === LOST_STATUS_ID);
  const total = lost.length;
  const counts = new Map<string, number>();

  for (const l of lost) {
    const label = l.lossReasonId ? nameById.get(l.lossReasonId) ?? `Motivo #${l.lossReasonId}` : "Sin motivo especificado";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count, pct: total > 0 ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count);
}

// ── Canal de entrada (WhatsApp / Instagram) ──────────────────────────────────

export const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  otro: "Otro canal",
  none: "Sin dato",
};
export const CHANNEL_COLOR: Record<string, string> = {
  whatsapp: "#25d366",
  instagram: "#e1306c",
  facebook: "#1877f2",
  otro: "#a78bfa",
  none: "#666",
};

export type ChannelRow = { channel: string; label: string; color: string; count: number; pct: number; won: number; closeRate: number | null };

// Leads del período por canal por el que escribieron, con cuántos se ganaron.
export function channelBreakdown(leads: KommoLeadRow[]): ChannelRow[] {
  const total = leads.length;
  const by = new Map<string, { count: number; won: number }>();
  for (const l of leads) {
    const key = l.channel ?? "none";
    const e = by.get(key) ?? { count: 0, won: 0 };
    e.count++;
    if (l.statusId === WON_STATUS_ID) e.won++;
    by.set(key, e);
  }
  return Array.from(by.entries())
    .map(([channel, v]) => ({
      channel,
      label: CHANNEL_LABEL[channel] ?? channel,
      color: CHANNEL_COLOR[channel] ?? "#888",
      count: v.count,
      pct: total > 0 ? (v.count / total) * 100 : 0,
      won: v.won,
      closeRate: v.count > 0 ? (v.won / v.count) * 100 : null,
    }))
    .sort((a, b) => b.count - a.count);
}

export type ChannelFunnel = { channels: { channel: string; label: string; color: string; total: number }[]; stages: { statusId: string; label: string; counts: Record<string, number> }[] };

// Embudo cruzado: cada etapa del pipeline × cada canal. Responde "de los que
// entraron por WhatsApp, dónde están hoy" vs. lo mismo para Instagram.
export function funnelByChannel(leads: KommoLeadRow[], pipeline: KommoPipeline): ChannelFunnel {
  const channels = channelBreakdown(leads).map((c) => ({ channel: c.channel, label: c.label, color: c.color, total: c.count }));
  const stages = pipeline.statuses.map((s) => {
    const counts: Record<string, number> = {};
    for (const l of leads) {
      if (l.statusId !== String(s.id)) continue;
      const key = l.channel ?? "none";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return { statusId: String(s.id), label: s.name, counts };
  });
  return { channels, stages };
}

// ── Respuestas de texto: Interés y Capital ───────────────────────────────────
// En Kommo "Interes" y "Capital" son campos de TEXTO (los completa el bot con
// la opción que elige el lead), no listas — así que no tienen opciones fijas
// y hay que normalizar las variantes de escritura. "Capital" además existe
// TRES veces (Capital, Capital, CAPITAL): se toma el primero que tenga valor.

function fieldValue(l: KommoLeadRow, matches: (name: string) => boolean): string | null {
  for (const f of l.customFields ?? []) {
    if (!matches(f.fieldName)) continue;
    const v = f.values.find((x) => x.value != null && String(x.value).trim() !== "");
    if (v) return String(v.value).trim();
  }
  return null;
}

export const INTEREST_OPTIONS = ["Ingreso pasivo USD", "Acumular BTC", "Estoy explorando"] as const;
const OTHER_ANSWER = "Otra respuesta (texto libre)";

export function normalizeInterest(raw: string): string {
  const v = raw.toLowerCase();
  if (v.includes("pasivo")) return "Ingreso pasivo USD";
  if (v.includes("btc") || v.includes("bitcoin") || v.includes("acumular")) return "Acumular BTC";
  if (v.includes("explorando")) return "Estoy explorando";
  return OTHER_ANSWER;
}

export const CAPITAL_OPTIONS = ["Menos de $5.000", "$5.000 a $10.000", "$10.000 a $15.000", "Más de $15.000"] as const;

// Lee los montos del texto ("$5.000 a $10.000", "5.000 a 10.000 USD",
// "Menos de $4500", "+$20.000") y lo ubica en un rango fijo.
export function normalizeCapital(raw: string): string {
  const v = raw.toLowerCase();
  const nums = (v.match(/\d[\d.,]*/g) ?? []).map((n) => Number(n.replace(/[.,]/g, ""))).filter((n) => n > 0);
  if (nums.length === 0) return OTHER_ANSWER;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  if (v.includes("menos") || hi < 5000) return "Menos de $5.000";
  if (v.includes("+") || v.includes("más") || v.includes("mas de") || lo >= 15000) return "Más de $15.000";
  if (hi <= 10000) return "$5.000 a $10.000";
  if (lo >= 10000) return "$10.000 a $15.000";
  return `$${lo.toLocaleString("es-AR")} a $${hi.toLocaleString("es-AR")}`; // rango viejo (ej: 5.000 a 15.000)
}

export type AnswerBreakdown = { title: string; rows: FieldBreakdownRow[]; answeredCount: number; totalCount: number };

function answerBreakdown(leads: KommoLeadRow[], title: string, order: readonly string[], matches: (name: string) => boolean, normalize: (raw: string) => string): AnswerBreakdown {
  const counts = new Map<string, number>();
  let answered = 0;
  for (const l of leads) {
    const raw = fieldValue(l, matches);
    if (!raw) continue;
    answered++;
    const key = normalize(raw);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rank = (v: string) => (order.indexOf(v) === -1 ? order.length : order.indexOf(v));
  const rows = Array.from(counts.entries())
    .map(([value, count]) => ({ value, count, pct: answered > 0 ? (count / answered) * 100 : 0 }))
    .sort((a, b) => rank(a.value) - rank(b.value) || b.count - a.count);
  return { title, rows, answeredCount: answered, totalCount: leads.length };
}

// % sobre los que RESPONDIERON (no sobre el total): así los porcentajes de
// cada opción suman 100% y no se diluyen con los que no contestaron.
export function interestBreakdown(leads: KommoLeadRow[]): AnswerBreakdown {
  return answerBreakdown(leads, "Interés", INTEREST_OPTIONS, (n) => /inter[eé]s/i.test(n), normalizeInterest);
}

export function capitalBreakdown(leads: KommoLeadRow[]): AnswerBreakdown {
  return answerBreakdown(leads, "Capital disponible", CAPITAL_OPTIONS, (n) => /capital/i.test(n), normalizeCapital);
}

// ── Tiempo hasta ganado ──────────────────────────────────────────────────────

export type TimeToWin = { count: number; avgDays: number | null; medianDays: number | null };

// Desde que el lead entra (= primer mensaje: Kommo crea el lead con el
// mensaje entrante) hasta que se marca ganado (closed_at). Mediana además
// del promedio porque unos pocos cierres de meses después inflan el promedio.
export function timeToWin(leads: KommoLeadRow[]): TimeToWin {
  const days = leads
    .filter((l) => l.statusId === WON_STATUS_ID && l.closedAt)
    .map((l) => (l.closedAt!.getTime() - l.kommoCreatedAt.getTime()) / 86_400_000)
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);
  if (days.length === 0) return { count: 0, avgDays: null, medianDays: null };
  const avg = days.reduce((s, d) => s + d, 0) / days.length;
  const mid = Math.floor(days.length / 2);
  const median = days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2;
  return { count: days.length, avgDays: avg, medianDays: median };
}
