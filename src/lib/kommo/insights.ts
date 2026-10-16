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

// Totales de todo el histórico (no acotado al período) — "cómo viene el
// pipeline en general", la foto completa más allá de lo que entró este mes.
export function pipelineTotals(leads: KommoLeadRow[], pipeline: KommoPipeline | null): PipelineTotals {
  const total = leads.length;
  const stage = firstOpenStage(pipeline);
  const won = leads.filter((l) => l.statusId === WON_STATUS_ID).length;
  const lost = leads.filter((l) => l.statusId === LOST_STATUS_ID).length;
  const contacted = stage ? leads.filter((l) => l.statusId !== String(stage.id)).length : total;
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
export function concretionFunnel(leads: KommoLeadRow[], pipeline: KommoPipeline | null): Concretion {
  const total = leads.length;
  const stage = firstOpenStage(pipeline);
  const inProgress = stage ? leads.filter((l) => l.statusId !== String(stage.id)).length : total;
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
export function salesLeaderboard(leads: KommoLeadRow[], users: KommoUser[], pipeline: KommoPipeline | null): LeaderboardRow[] {
  const nameById = new Map(users.map((u) => [String(u.id), u.name]));
  const stage = firstOpenStage(pipeline);
  const byUser = new Map<string, { contacted: number; won: number }>();

  for (const l of leads) {
    if (!l.responsibleUserId) continue;
    const entry = byUser.get(l.responsibleUserId) ?? { contacted: 0, won: 0 };
    if (!stage || l.statusId !== String(stage.id)) entry.contacted++;
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
