import { and, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { kommoLeads } from "@/db/schema";
import { getPipelines, getLeadsCustomFields } from "@/lib/kommo/api";
import { customFieldBreakdown, leadsFunnel } from "@/lib/kommo/insights";
import { PeriodFilter } from "@/components/PeriodFilter";
import { StatDelta } from "@/components/StatDelta";
import { StatLabel } from "@/components/StatLabel";

export const dynamic = "force-dynamic";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default async function KommoPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const toDate = to ? new Date(to + "T23:59:59") : new Date();
  const fromDate = from ? new Date(from + "T00:00:00") : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const prevWindowFrom = new Date(fromDate.getTime() - (toDate.getTime() - fromDate.getTime()));

  // Pipelines y campos personalizados se piden en vivo (no se persisten):
  // cambian poco, y así siempre reflejan los nombres/colores/orden actuales
  // de Kommo sin que un sync viejo quede desactualizado. Si Kommo no está
  // configurado todavía (faltan las env vars), esto tira error — se atrapa
  // abajo para mostrar un estado claro en vez de romper la página.
  let pipelines: Awaited<ReturnType<typeof getPipelines>> = [];
  let customFields: Awaited<ReturnType<typeof getLeadsCustomFields>> = [];
  let kommoError: string | null = null;
  try {
    [pipelines, customFields] = await Promise.all([getPipelines(), getLeadsCustomFields()]);
  } catch (err) {
    kommoError = err instanceof Error ? err.message : "Error desconocido al conectar con Kommo.";
  }

  if (kommoError) {
    return (
      <main className="page">
        <div className="page-header">
          <h1 className="page-title">Kommo (CRM)</h1>
        </div>
        <div className="card">
          <div className="connect-cta">
            <div className="connect-cta-icon">📇</div>
            <h2>No se pudo conectar con Kommo</h2>
            <p style={{ maxWidth: 480 }}>{kommoError}</p>
            <p style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
              Revisá que <code>KOMMO_SUBDOMAIN</code> y <code>KOMMO_ACCESS_TOKEN</code> estén cargados en Vercel.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const [periodLeads, prevLeads] = await Promise.all([
    db.query.kommoLeads.findMany({ where: and(gte(kommoLeads.kommoCreatedAt, fromDate), lte(kommoLeads.kommoCreatedAt, toDate)) }),
    db.query.kommoLeads.findMany({ where: and(gte(kommoLeads.kommoCreatedAt, prevWindowFrom), lte(kommoLeads.kommoCreatedAt, fromDate)) }),
  ]);

  const lastSync = periodLeads.reduce<Date | null>((latest, l) => (!latest || l.syncedAt > latest ? l.syncedAt : latest), null);

  const mainPipeline = pipelines.find((p) => p.isMain) ?? pipelines[0] ?? null;
  const funnel = mainPipeline ? leadsFunnel(periodLeads, mainPipeline) : [];

  const breakdowns = customFields
    .map((f) => customFieldBreakdown(periodLeads, f))
    .filter((b) => b.answeredCount > 0); // no mostrar campos que nadie completó en el período

  const totalPrice = periodLeads.reduce((s, l) => s + (l.price ?? 0), 0);
  const prevTotalPrice = prevLeads.reduce((s, l) => s + (l.price ?? 0), 0);

  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">Kommo (CRM)</h1>
        <p className="page-subtitle">
          {periodLeads.length === 0 && pipelines.length > 0
            ? "Sin leads sincronizados todavía para este período — sincronizá desde Administración."
            : lastSync
              ? `Última sincronización: ${lastSync.toLocaleString("es-AR")}`
              : ""}
        </p>
      </div>

      <PeriodFilter />

      <div className="stats-grid" style={{ marginTop: "1.25rem" }}>
        <div className="stat-card">
          <StatLabel label="Leads del período" info="Cantidad de leads nuevos creados en Kommo durante el período elegido." />
          <div className="stat-value accent">{fmt(periodLeads.length)}</div>
          <StatDelta curr={periodLeads.length} prev={prevLeads.length} />
        </div>
        <div className="stat-card">
          <StatLabel label="Valor total en pipeline" info="Suma del campo 'presupuesto' de todos los leads del período, en la moneda de tu cuenta de Kommo." />
          <div className="stat-value accent">{fmt(totalPrice)}</div>
          <StatDelta curr={totalPrice} prev={prevTotalPrice} />
        </div>
      </div>

      {mainPipeline && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.2rem" }}>🔀 Embudo — {mainPipeline.name}</h2>
          <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", margin: "0 0 1rem" }}>
            En qué etapa está HOY cada lead que entró en el período (no es el historial de por dónde pasó cada uno).
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {funnel.map((stage) => (
              <div key={stage.statusId}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "0.2rem" }}>
                  <span>{stage.label}</span>
                  <span style={{ fontWeight: 600 }}>{stage.count} <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>({stage.pct.toFixed(0)}%)</span></span>
                </div>
                <div style={{ height: 8, background: "var(--surface2)", borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, stage.pct)}%`, background: stage.color ?? "var(--accent)", borderRadius: 6 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {breakdowns.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginTop: "1.5rem" }}>
          {breakdowns.map((b) => (
            <div key={b.fieldId} className="card">
              <h3 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.15rem" }}>{b.fieldName}</h3>
              <p style={{ fontSize: "0.68rem", color: "var(--text-tertiary)", margin: "0 0 0.9rem" }}>
                {b.answeredCount} de {b.totalCount} leads respondieron este campo
                {b.fieldType === "multiselect" ? " (pueden elegir más de una opción, el % puede sumar más de 100%)" : ""}.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                {b.rows.map((row) => (
                  <div key={row.value}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", marginBottom: "0.15rem" }}>
                      <span>{row.value}</span>
                      <span style={{ fontWeight: 600 }}>{row.count} <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>({row.pct.toFixed(0)}%)</span></span>
                    </div>
                    <div style={{ height: 6, background: "var(--surface2)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, row.pct)}%`, background: "var(--accent)", borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
