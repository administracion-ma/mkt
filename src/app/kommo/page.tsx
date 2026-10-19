import { and, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { kommoLeads } from "@/db/schema";
import { getPipelines, getLeadsCustomFields, getUsers, getLossReasons } from "@/lib/kommo/api";
import {
  customFieldBreakdown,
  leadsFunnel,
  pipelineTotals,
  concretionFunnel,
  salesLeaderboard,
  lossReasonsBreakdown,
  WON_STATUS_ID,
  LOST_STATUS_ID,
} from "@/lib/kommo/insights";
import { PeriodFilter } from "@/components/PeriodFilter";
import { StatDelta } from "@/components/StatDelta";
import { StatLabel } from "@/components/StatLabel";

export const dynamic = "force-dynamic";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 8, background: "var(--surface2)", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, pct))}%`, background: color, borderRadius: 6 }} />
    </div>
  );
}

const LOSS_COLORS = ["#ef4444", "#f97316", "#eab308", "#a78bfa", "#60a5fa", "#2dd4bf", "#f472b6", "#888"];

export default async function KommoPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const toDate = to ? new Date(to + "T23:59:59") : new Date();
  const fromDate = from ? new Date(from + "T00:00:00") : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const prevWindowFrom = new Date(fromDate.getTime() - (toDate.getTime() - fromDate.getTime()));

  // Pipelines, campos, vendedores y motivos de pérdida se piden en vivo (no
  // se persisten): cambian poco, y así siempre reflejan lo que hay HOY en
  // Kommo. Si Kommo no está configurado (faltan las env vars), esto tira
  // error — se atrapa abajo para mostrar un estado claro en vez de romper.
  let pipelines: Awaited<ReturnType<typeof getPipelines>> = [];
  let customFields: Awaited<ReturnType<typeof getLeadsCustomFields>> = [];
  let users: Awaited<ReturnType<typeof getUsers>> = [];
  let lossReasons: Awaited<ReturnType<typeof getLossReasons>> = [];
  let kommoError: string | null = null;
  try {
    [pipelines, customFields, users, lossReasons] = await Promise.all([
      getPipelines(),
      getLeadsCustomFields(),
      getUsers(),
      getLossReasons(),
    ]);
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

  const [periodLeads, prevLeads, statusCounts, [syncInfo]] = await Promise.all([
    db.query.kommoLeads.findMany({ where: and(gte(kommoLeads.kommoCreatedAt, fromDate), lte(kommoLeads.kommoCreatedAt, toDate)) }),
    db.query.kommoLeads.findMany({ where: and(gte(kommoLeads.kommoCreatedAt, prevWindowFrom), lte(kommoLeads.kommoCreatedAt, fromDate)) }),
    // Todo el histórico — para "estado general del pipeline", que es la foto
    // completa, no acotada al período elegido arriba. Solo conteos por etapa.
    db
      .select({ statusId: kommoLeads.statusId, count: sql<number>`count(*)::int` })
      .from(kommoLeads)
      .groupBy(kommoLeads.statusId),
    db.select({ lastSync: sql<string | null>`max(${kommoLeads.syncedAt})` }).from(kommoLeads),
  ]);

  const lastSync = syncInfo?.lastSync ? new Date(syncInfo.lastSync) : null;
  const mainPipeline = pipelines.find((p) => p.isMain) ?? pipelines[0] ?? null;

  const funnel = mainPipeline ? leadsFunnel(periodLeads, mainPipeline) : [];
  const totals = pipelineTotals(statusCounts, mainPipeline);
  const concretion = concretionFunnel(periodLeads, mainPipeline);
  const leaderboard = salesLeaderboard(periodLeads, users, mainPipeline);
  const lossBreakdown = lossReasonsBreakdown(periodLeads, lossReasons);
  const lostCount = periodLeads.filter((l) => l.statusId === LOST_STATUS_ID).length;

  const breakdowns = customFields
    .map((f) => customFieldBreakdown(periodLeads, f))
    .filter((b) => b.answeredCount > 0); // no mostrar campos que nadie completó en el período

  const wonLeads = periodLeads.filter((l) => l.statusId === WON_STATUS_ID);
  const prevWonLeads = prevLeads.filter((l) => l.statusId === WON_STATUS_ID);
  const closeRatePeriod = periodLeads.length > 0 ? (wonLeads.length / periodLeads.length) * 100 : null;
  const wonValue = wonLeads.reduce((s, l) => s + (l.price ?? 0), 0);
  const prevWonValue = prevWonLeads.reduce((s, l) => s + (l.price ?? 0), 0);

  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">Kommo (CRM)</h1>
        <p className="page-subtitle">
          {totals.total === 0 && pipelines.length > 0
            ? "Sin leads sincronizados todavía — sincronizá desde Administración."
            : lastSync
              ? `Última sincronización: ${lastSync.toLocaleString("es-AR")}`
              : ""}
        </p>
      </div>

      <PeriodFilter />

      {/* KPIs del período elegido */}
      <div className="stats-grid" style={{ marginTop: "1.25rem" }}>
        <div className="stat-card">
          <StatLabel label="Leads del período" info="Cantidad de leads nuevos creados en Kommo durante el período elegido." />
          <div className="stat-value accent">{fmt(periodLeads.length)}</div>
          <StatDelta curr={periodLeads.length} prev={prevLeads.length} />
        </div>
        <div className="stat-card">
          <StatLabel label="Cierres" info="Leads de este período que llegaron a la etapa de ganado." />
          <div className="stat-value accent">{fmt(wonLeads.length)}</div>
          <StatDelta curr={wonLeads.length} prev={prevWonLeads.length} />
        </div>
        <div className="stat-card">
          <StatLabel label="Tasa de cierre" info="Cierres del período sobre el total de leads del período. No compara contra el período anterior porque depende mucho del volumen de cada mes." />
          <div className="stat-value">{closeRatePeriod != null ? `${closeRatePeriod.toFixed(0)}%` : "—"}</div>
        </div>
        <div className="stat-card">
          <StatLabel label="Valor ganado" info="Suma del campo precio de los leads ganados en el período, en la moneda de tu cuenta de Kommo." />
          <div className="stat-value accent">{fmt(wonValue)}</div>
          <StatDelta curr={wonValue} prev={prevWonValue} />
        </div>
      </div>

      {/* Estado general — todo el histórico, no solo el período */}
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.2rem" }}>📊 Estado general del pipeline (todo el tiempo)</h2>
        <div className="stats-grid" style={{ marginTop: "0.85rem" }}>
          <div>
            <StatLabel label="Total de leads" info="Todos los leads que entraron a Kommo alguna vez, sin filtrar por fecha." />
            <div className="stat-value">{fmt(totals.total)}</div>
          </div>
          <div>
            <StatLabel label="Avanzaron" info="Leads que salieron de la primera etapa del pipeline — tuvieron algún movimiento más allá de ingresar." />
            <div className="stat-value">{fmt(totals.contacted)}</div>
          </div>
          <div>
            <StatLabel label="Tasa de avance" info="Avanzaron sobre el total histórico." />
            <div className="stat-value">{totals.responseRate != null ? `${totals.responseRate.toFixed(0)}%` : "—"}</div>
          </div>
          <div>
            <StatLabel label="Ganados / Perdidos" info="Leads que llegaron a una etapa final (ganada o perdida) en todo el histórico, y qué % de esos cierres fue ganado." />
            <div className="stat-value">
              {fmt(totals.won)} <span style={{ color: "var(--text-tertiary)", fontSize: "0.75em" }}>/</span> {fmt(totals.lost)}
              {totals.closeRate != null && (
                <span style={{ color: "var(--text-tertiary)", fontSize: "0.6em", fontWeight: 500, marginLeft: "0.4rem" }}>
                  ({totals.closeRate.toFixed(0)}% cierre)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mini-embudo del período: 3 pasos grandes */}
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.2rem" }}>
          <h2 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>🎯 Concreción del período</h2>
          {concretion.rate != null && (
            <span style={{ fontSize: "0.72rem", color: "var(--text-tertiary)" }}>
              Tasa de concreción <strong style={{ color: "var(--accent)" }}>{concretion.rate.toFixed(0)}%</strong>
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", flexWrap: "wrap", marginTop: "1rem" }}>
          {concretion.steps.map((step, i) => (
            <div key={step.label} style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.8rem", fontWeight: 700 }}>{fmt(step.count)}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)" }}>{step.label}</div>
              </div>
              {i < concretion.steps.length - 1 && <span style={{ color: "var(--text-tertiary)", fontSize: "1.2rem" }}>→</span>}
            </div>
          ))}
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
                <Bar pct={stage.pct} color={stage.color ?? "var(--accent)"} />
              </div>
            ))}
          </div>
        </div>
      )}

      {leaderboard.length > 0 && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.2rem" }}>🏆 Ranking de vendedores</h2>
          <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", margin: "0 0 1rem" }}>
            Leads del período asignados a cada responsable en Kommo. Ordenado por cierres.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
            {leaderboard.map((row, i) => (
              <div key={row.userId} style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.72rem", fontWeight: 700, background: i === 0 ? "var(--accent)" : "var(--surface2)",
                  color: i === 0 ? "#000" : "var(--text-secondary)", flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{row.name}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>
                    {row.contacted} contactado{row.contacted !== 1 ? "s" : ""}
                    {row.closeRate != null && ` · ${row.closeRate.toFixed(0)}% tasa de cierre`}
                  </div>
                </div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--accent)", flexShrink: 0 }}>{row.won}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lostCount > 0 && lossBreakdown.length > 0 && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.2rem" }}>📉 Motivos de pérdida</h2>
          <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", margin: "0 0 1rem" }}>
            {lostCount} lead{lostCount !== 1 ? "s" : ""} perdido{lostCount !== 1 ? "s" : ""} en el período.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
            {lossBreakdown.map((row, i) => (
              <div key={row.reason}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "0.2rem" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: LOSS_COLORS[i % LOSS_COLORS.length], flexShrink: 0 }} />
                    {row.reason}
                  </span>
                  <span style={{ fontWeight: 600 }}>{row.count} <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>({row.pct.toFixed(0)}%)</span></span>
                </div>
                <Bar pct={row.pct} color={LOSS_COLORS[i % LOSS_COLORS.length]} />
              </div>
            ))}
          </div>
        </div>
      )}

      {breakdowns.length > 0 && (
        <>
          <h2 style={{ fontSize: "0.9rem", fontWeight: 600, margin: "1.5rem 0 0.85rem" }}>👤 Perfil de leads</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
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
                      <Bar pct={row.pct} color="var(--accent)" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
