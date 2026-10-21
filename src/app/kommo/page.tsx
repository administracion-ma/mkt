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
  channelBreakdown,
  funnelByChannel,
  interestBreakdown,
  capitalBreakdown,
  timeToWin,
  qualificationRate,
  callRate,
  type AnswerBreakdown,
  INTEREST_OPTIONS,
  INTEREST_COLORS,
  CAPITAL_OPTIONS,
  CAPITAL_COLORS,
  WON_STATUS_ID,
  LOST_STATUS_ID,
} from "@/lib/kommo/insights";
import Link from "next/link";
import { PeriodFilter } from "@/components/PeriodFilter";
import { StatDelta } from "@/components/StatDelta";
import { StatLabel } from "@/components/StatLabel";
import { DonutChart } from "@/components/DonutChart";
import { DrillPeriod, DrillStat } from "@/components/kommo/LeadsDrilldown";

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

function fmtDays(d: number | null): string {
  if (d == null) return "—";
  if (d < 1) return `${Math.round(d * 24)} h`;
  return `${d.toFixed(d < 10 ? 1 : 0)} días`;
}

// Torta de una pregunta del bot. Base = los que respondieron con una de las
// opciones conocidas (n), así es comparable con estadísticas de otras
// campañas; las respuestas escritas a mano se informan aparte.
function AnswerDonutCard({ b, options, colors, filterPrefix }: { b: AnswerBreakdown; options: readonly string[]; colors: Record<string, string>; filterPrefix: string }) {
  const slices = options.map((o) => ({ label: o, count: b.rows.find((r) => r.value === o)?.count ?? 0, color: colors[o] }));
  const n = slices.reduce((s, x) => s + x.count, 0);
  const other = b.answeredCount - n;
  return (
    <div className="card">
      <h3 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.15rem" }}>
        {b.title} <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>(n={n})</span>
      </h3>
      <p style={{ fontSize: "0.68rem", color: "var(--text-tertiary)", margin: "0 0 1rem" }}>
        % sobre los que completaron el campo con una opción. {b.totalCount - b.answeredCount} de {b.totalCount} leads no respondieron
        {other > 0 && `; ${other} escribieron otra cosa (no se cuentan)`}.
      </p>
      {n === 0 ? (
        <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", margin: 0 }}>Nadie respondió en este período.</p>
      ) : (
        <DonutChart slices={slices} centerLabel="respondieron" drill={{ filterPrefix, title: b.title }} />
      )}
    </div>
  );
}

const LOSS_COLORS = ["#ef4444", "#f97316", "#eab308", "#a78bfa", "#60a5fa", "#2dd4bf", "#f472b6", "#888"];

export default async function KommoPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; pipeline?: string }>;
}) {
  const { from, to, pipeline: pipelineParam } = await searchParams;
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
      .select({ pipelineId: kommoLeads.pipelineId, statusId: kommoLeads.statusId, count: sql<number>`count(*)::int` })
      .from(kommoLeads)
      .groupBy(kommoLeads.pipelineId, kommoLeads.statusId),
    db.select({ lastSync: sql<string | null>`max(${kommoLeads.syncedAt})` }).from(kommoLeads),
  ]);

  const lastSync = syncInfo?.lastSync ? new Date(syncInfo.lastSync) : null;
  // Pipeline del embudo: el elegido, o si no el que más leads recibió en el
  // período (NO el marcado "principal" en Kommo: hoy casi todo entra a
  // "Filtrado" y el principal quedaba vacío).
  const leadsByPipeline = new Map<string, number>();
  for (const l of periodLeads) if (l.pipelineId) leadsByPipeline.set(l.pipelineId, (leadsByPipeline.get(l.pipelineId) ?? 0) + 1);
  const pipelinesWithLeads = pipelines
    .filter((p) => leadsByPipeline.has(String(p.id)))
    .sort((a, b) => (leadsByPipeline.get(String(b.id)) ?? 0) - (leadsByPipeline.get(String(a.id)) ?? 0));
  const mainPipeline =
    pipelines.find((p) => String(p.id) === pipelineParam) ?? pipelinesWithLeads[0] ?? pipelines.find((p) => p.isMain) ?? pipelines[0] ?? null;
  const pipelineLeads = mainPipeline ? periodLeads.filter((l) => l.pipelineId === String(mainPipeline.id)) : [];
  const pipelineHref = (id: number) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    q.set("pipeline", String(id));
    return `/kommo?${q.toString()}`;
  };

  const funnel = mainPipeline ? leadsFunnel(pipelineLeads, mainPipeline) : [];
  const channelFunnel = mainPipeline ? funnelByChannel(pipelineLeads, mainPipeline) : null;
  const totals = pipelineTotals(statusCounts, pipelines);
  const concretion = concretionFunnel(periodLeads, pipelines);
  const leaderboard = salesLeaderboard(periodLeads, users, pipelines);
  const channels = channelBreakdown(periodLeads);
  const interest = interestBreakdown(periodLeads);
  const capital = capitalBreakdown(periodLeads);
  const winTime = timeToWin(periodLeads);
  const qualified = qualificationRate(periodLeads, pipelines);
  const prevQualified = qualificationRate(prevLeads, pipelines);
  const called = callRate(periodLeads);
  const prevWinTime = timeToWin(prevLeads);
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

      <DrillPeriod from={fromDate.toISOString()} to={toDate.toISOString()}>
      <p style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", margin: "0.75rem 0 0" }}>Tocá cualquier número del período para ver la lista de leads y abrirlos en Kommo.</p>

      {/* KPIs del período elegido */}
      <div className="stats-grid" style={{ marginTop: "1.25rem" }}>
        <div className="stat-card">
          <StatLabel label="Leads del período" info="Cantidad de leads nuevos creados en Kommo durante el período elegido." />
          <DrillStat filter="all" title="Leads del período">
            <div className="stat-value accent">{fmt(periodLeads.length)}</div>
          </DrillStat>
          <StatDelta curr={periodLeads.length} prev={prevLeads.length} />
        </div>
        <div className="stat-card">
          <StatLabel label="Cierres" info="Leads de este período que llegaron a la etapa de ganado." />
          <DrillStat filter="won" title="Cierres del período">
            <div className="stat-value accent">{fmt(wonLeads.length)}</div>
          </DrillStat>
          <StatDelta curr={wonLeads.length} prev={prevWonLeads.length} />
        </div>
        <div className="stat-card">
          <StatLabel label="Tasa de cierre" info="Cierres del período sobre el total de leads del período. No compara contra el período anterior porque depende mucho del volumen de cada mes." />
          <DrillStat filter="won" title="Cierres del período">
            <div className="stat-value">{closeRatePeriod != null ? `${closeRatePeriod.toFixed(1)}%` : "—"}</div>
          </DrillStat>
        </div>
        <div className="stat-card">
          <StatLabel label="Valor ganado" info="Suma del campo precio de los leads ganados en el período, en la moneda de tu cuenta de Kommo." />
          <DrillStat filter="won" title="Cierres del período">
            <div className="stat-value accent">{fmt(wonValue)}</div>
          </DrillStat>
          <StatDelta curr={wonValue} prev={prevWonValue} />
        </div>
        <div className="stat-card">
          <StatLabel
            label="Tiempo hasta ganado"
            info="Promedio de tiempo entre el primer mensaje del lead (cuando se crea en Kommo) y que pasa a ganado, para los leads del período que ya se ganaron. Abajo, la mediana: el caso típico, sin que unos pocos cierres muy lentos la inflen."
          />
          <DrillStat filter="won" title="Cierres del período">
            <div className="stat-value">{fmtDays(winTime.avgDays)}</div>
          </DrillStat>
          <div style={{ fontSize: "0.68rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
            Mediana {fmtDays(winTime.medianDays)} · {winTime.count} cierre{winTime.count !== 1 ? "s" : ""}
            {prevWinTime.avgDays != null && ` · antes ${fmtDays(prevWinTime.avgDays)}`}
          </div>
        </div>
        <div className="stat-card">
          <StatLabel
            label="Ingreso → calificado"
            info="De los leads que entraron en el período, cuántos pasaron a la etapa Calificado (o más adelante: propuesta, decisión, ganado). Usa el historial de Kommo, así que cuenta también a los que se calificaron y después se perdieron."
          />
          <DrillStat filter="qualified" title="Leads que pasaron a calificado">
            <div className="stat-value">{qualified.rate != null ? `${qualified.rate.toFixed(1)}%` : "—"}</div>
          </DrillStat>
          <div style={{ fontSize: "0.68rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
            {qualified.count} de {qualified.total}
            {prevQualified.rate != null && ` · antes ${prevQualified.rate.toFixed(1)}%`}
          </div>
        </div>
        <div className="stat-card">
          <StatLabel
            label="Mensaje → llamada"
            info='Leads del período con el interruptor "Llamado" activado en su tarjeta de Kommo, sobre el total que entró. Depende de que el vendedor lo marque.'
          />
          <DrillStat filter="called" title="Leads con llamada">
            <div className="stat-value">{called.rate != null ? `${called.rate.toFixed(1)}%` : "—"}</div>
          </DrillStat>
          <div style={{ fontSize: "0.68rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
            {called.count} de {called.total} con &quot;Llamado&quot; marcado
          </div>
        </div>
      </div>

      {/* Mensajes por canal */}
      {channels.length > 0 && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.2rem" }}>💬 Mensajes por canal</h2>
          <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", margin: "0 0 1rem" }}>
            Por dónde escribió cada lead que entró en el período, cuántos se calificaron y cuántos terminaron ganados.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
            {channels.map((c) => {
              const cq = qualificationRate(periodLeads.filter((l) => (l.channel ?? "none") === c.channel), pipelines);
              return (
              <DrillStat key={c.channel} filter={`channel:${c.channel}`} title={`Leads de ${c.label}`}>
              <div style={{ padding: "0.9rem 1rem", background: "var(--surface2)", borderRadius: 10, borderLeft: `3px solid ${c.color}` }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{c.label}</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 700, margin: "0.15rem 0" }}>
                  {fmt(c.count)} <span style={{ fontSize: "0.55em", color: "var(--text-tertiary)", fontWeight: 500 }}>{c.pct.toFixed(0)}%</span>
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>
                  {c.won} ganado{c.won !== 1 ? "s" : ""}
                  {c.closeRate != null && ` · ${c.closeRate.toFixed(1)}% cierre`}
                  {cq.rate != null && ` · ${cq.rate.toFixed(0)}% calificados`}
                </div>
              </div>
              </DrillStat>
              );
            })}
          </div>
          <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", marginTop: "1rem" }}>
            {channels.map((c) => (
              <div key={c.channel} title={`${c.label}: ${c.pct.toFixed(0)}%`} style={{ width: `${c.pct}%`, background: c.color }} />
            ))}
          </div>
        </div>
      )}

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
                <DrillStat filter={["all", "inprog", "won"][i]} title={step.label}>
                  <div style={{ fontSize: "1.8rem", fontWeight: 700 }}>{fmt(step.count)}</div>
                </DrillStat>
                <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)" }}>{step.label}</div>
              </div>
              {i < concretion.steps.length - 1 && <span style={{ color: "var(--text-tertiary)", fontSize: "1.2rem" }}>→</span>}
            </div>
          ))}
        </div>
      </div>

      {mainPipeline && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.2rem" }}>🔀 Embudo — {mainPipeline.name.trim()}</h2>
          <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", margin: "0 0 0.75rem" }}>
            En qué etapa está HOY cada lead que entró en el período a este pipeline ({pipelineLeads.length} leads). No es el historial de por dónde pasó cada uno.
          </p>
          {pipelinesWithLeads.length > 1 && (
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              {pipelinesWithLeads.map((p) => {
                const active = p.id === mainPipeline.id;
                return (
                  <Link
                    key={p.id}
                    href={pipelineHref(p.id)}
                    style={{
                      fontSize: "0.7rem", padding: "0.25rem 0.65rem", borderRadius: 999, textDecoration: "none",
                      background: active ? "var(--accent)" : "var(--surface2)", color: active ? "#000" : "var(--text-secondary)", fontWeight: active ? 600 : 500,
                    }}
                  >
                    {p.name.trim()} ({leadsByPipeline.get(String(p.id))})
                  </Link>
                );
              })}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {funnel.map((stage) => (
              <DrillStat key={stage.statusId} filter={`pipeline:${mainPipeline.id}|status:${stage.statusId}`} title={`${mainPipeline.name.trim()} — ${stage.label}`}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "0.2rem" }}>
                  <span>{stage.label}</span>
                  <span style={{ fontWeight: 600 }}>{stage.count} <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>({stage.pct.toFixed(0)}%)</span></span>
                </div>
                <Bar pct={stage.pct} color={stage.color ?? "var(--accent)"} />
              </DrillStat>
            ))}
          </div>

          {channelFunnel && channelFunnel.channels.length > 1 && (
            <div style={{ overflowX: "auto", marginTop: "1.5rem" }}>
              <h3 style={{ fontSize: "0.8rem", fontWeight: 600, margin: "0 0 0.5rem" }}>Por canal</h3>
              <table className="table" style={{ width: "100%", fontSize: "0.75rem" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Etapa</th>
                    {channelFunnel.channels.map((c) => (
                      <th key={c.channel} style={{ textAlign: "right" }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: c.color, marginRight: 6 }} />
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {channelFunnel.stages.map((st) => (
                    <tr key={st.statusId}>
                      <td>{st.label}</td>
                      {channelFunnel.channels.map((c) => {
                        const n = st.counts[c.channel] ?? 0;
                        return (
                          <td key={c.channel} style={{ textAlign: "right" }}>
                            <DrillStat
                              block={false}
                              filter={`pipeline:${mainPipeline.id}|status:${st.statusId}|channel:${c.channel}`}
                              title={`${st.label} — ${c.label}`}
                            >
                              {n}{" "}
                              <span style={{ color: "var(--text-tertiary)" }}>({c.total > 0 ? ((n / c.total) * 100).toFixed(0) : 0}%)</span>
                            </DrillStat>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 600 }}>
                    <td>Total</td>
                    {channelFunnel.channels.map((c) => (
                      <td key={c.channel} style={{ textAlign: "right" }}>{c.total}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
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
              <DrillStat key={row.userId} filter={`user:${row.userId}`} title={`Leads de ${row.name}`}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
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
              </DrillStat>
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
              <DrillStat key={row.reasonId} filter={`lost|loss:${row.reasonId}`} title={`Perdidos — ${row.reason}`}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "0.2rem" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: LOSS_COLORS[i % LOSS_COLORS.length], flexShrink: 0 }} />
                    {row.reason}
                  </span>
                  <span style={{ fontWeight: 600 }}>{row.count} <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>({row.pct.toFixed(0)}%)</span></span>
                </div>
                <Bar pct={row.pct} color={LOSS_COLORS[i % LOSS_COLORS.length]} />
              </DrillStat>
            ))}
          </div>
        </div>
      )}

      <h2 style={{ fontSize: "0.9rem", fontWeight: 600, margin: "1.5rem 0 0.85rem" }}>👤 Perfil de leads</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
        <AnswerDonutCard b={interest} options={INTEREST_OPTIONS} colors={INTEREST_COLORS} filterPrefix="interest" />
        <AnswerDonutCard b={capital} options={CAPITAL_OPTIONS} colors={CAPITAL_COLORS} filterPrefix="capital" />
      </div>

      {breakdowns.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
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
      </DrillPeriod>
    </main>
  );
}
