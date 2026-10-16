import { db } from "@/db/client";
import { kommoLeads } from "@/db/schema";
import { getLeadsCreatedBetween, type KommoLeadRaw } from "@/lib/kommo/api";

function toDate(unix: number | null): Date | null {
  return unix != null ? new Date(unix * 1000) : null;
}

function mapLead(l: KommoLeadRaw) {
  return {
    kommoLeadId: String(l.id),
    name: l.name,
    price: l.price,
    pipelineId: l.pipeline_id != null ? String(l.pipeline_id) : null,
    statusId: l.status_id != null ? String(l.status_id) : null,
    responsibleUserId: l.responsible_user_id != null ? String(l.responsible_user_id) : null,
    closedAt: toDate(l.closed_at),
    kommoCreatedAt: toDate(l.created_at) ?? new Date(),
    kommoUpdatedAt: toDate(l.updated_at),
    customFields: (l.custom_fields_values ?? []).map((f) => ({
      fieldId: f.field_id,
      fieldName: f.field_name,
      fieldType: f.field_type,
      values: f.values.map((v) => ({ value: v.value, enumId: v.enum_id ?? null })),
    })),
    syncedAt: new Date(),
  };
}

// Sincroniza los leads creados en los últimos `days` (default ~13 meses, para
// tener de sobra para comparar año contra año). Upsert por kommoLeadId: un
// lead que cambió de etapa desde el último sync se actualiza, no duplica.
export async function syncKommoLeads(days = 400): Promise<{ synced: number }> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const raw = await getLeadsCreatedBetween(from, to);

  let synced = 0;
  // De a 1 por vez pero sin esperar red entre cada uno más que el propio
  // insert: con cientos de leads esto es rápido igual, y evita problemas de
  // concurrencia contra el pool de conexiones (mismo criterio que el resto
  // de la app después del incidente de los 504 por contención).
  for (const l of raw) {
    const values = mapLead(l);
    await db
      .insert(kommoLeads)
      .values(values)
      .onConflictDoUpdate({ target: kommoLeads.kommoLeadId, set: values });
    synced++;
  }

  return { synced };
}
