import { sql } from "drizzle-orm";
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
    lossReasonId: l.loss_reason_id != null ? String(l.loss_reason_id) : null,
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
  if (raw.length === 0) return { synced: 0 };

  // Insertar de a 1 por lead (un viaje a la base cada uno) escalaba mal: con
  // varios cientos de leads en 13 meses, la suma de round-trips superaba el
  // tiempo que el navegador esperaba la respuesta y la página mostraba un
  // error genérico de red. Ahora se inserta en tandas de hasta 300 leads en
  // una sola consulta (INSERT ... ON CONFLICT DO UPDATE con `excluded`, el
  // valor que intentaba insertarse, como fuente del UPDATE).
  const CHUNK = 300;
  let synced = 0;
  for (let i = 0; i < raw.length; i += CHUNK) {
    const chunk = raw.slice(i, i + CHUNK).map(mapLead);
    await db
      .insert(kommoLeads)
      .values(chunk)
      .onConflictDoUpdate({
        target: kommoLeads.kommoLeadId,
        set: {
          name: sql`excluded.name`,
          price: sql`excluded.price`,
          pipelineId: sql`excluded.pipeline_id`,
          statusId: sql`excluded.status_id`,
          responsibleUserId: sql`excluded.responsible_user_id`,
          closedAt: sql`excluded.closed_at`,
          lossReasonId: sql`excluded.loss_reason_id`,
          kommoCreatedAt: sql`excluded.kommo_created_at`,
          kommoUpdatedAt: sql`excluded.kommo_updated_at`,
          customFields: sql`excluded.custom_fields`,
          syncedAt: sql`excluded.synced_at`,
        },
      });
    synced += chunk.length;
  }

  return { synced };
}
