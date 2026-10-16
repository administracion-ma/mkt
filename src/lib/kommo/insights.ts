import type { kommoLeads } from "@/db/schema";
import type { KommoCustomField, KommoPipeline } from "@/lib/kommo/api";

export type KommoLeadRow = typeof kommoLeads.$inferSelect;

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
