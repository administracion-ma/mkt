import type { HeatCell, HookPost, WeekPoint, PillarStat, HashtagStat } from "@/lib/insights";
import { DAY_LABELS, SLOT_LABELS } from "@/lib/insights";

// Color de marca ajustado a la banda de luminosidad para modo oscuro
// (validado: L 0.60, contraste ≥3:1 sobre #0A0A0A)
const MARK = "#CC7508";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}
function fmtSec(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const s = ms / 1000;
  return s >= 60 ? `${Math.floor(s / 60)}m${Math.round(s % 60)}s` : `${s.toFixed(1)}s`;
}

function PanelTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: "0.9rem" }}>
      <h3 style={{ fontSize: "0.82rem", fontWeight: 600, margin: 0, color: "var(--text)" }}>{children}</h3>
      {hint && <p style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", margin: "0.2rem 0 0" }}>{hint}</p>}
    </div>
  );
}

// ── Alcance semanal (barras) ──────────────────────────────────────────────────
export function WeeklyReachChart({ points }: { points: WeekPoint[] }) {
  const withData = points.filter((p) => p.medianReach != null);
  if (withData.length < 2) {
    return (
      <div className="card">
        <PanelTitle>Alcance semanal</PanelTitle>
        <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
          Se necesitan posts en al menos 2 semanas distintas para dibujar la tendencia.
        </p>
      </div>
    );
  }

  const W = 520, H = 150, PAD_B = 22, PAD_T = 16;
  const max = Math.max(...withData.map((p) => p.medianReach!));
  const barW = Math.floor(W / points.length) - 4;
  const maxIdx = points.findIndex((p) => p.medianReach === max);

  return (
    <div className="card">
      <PanelTitle hint="Mediana de alcance de los posts publicados cada semana (últimas 12)">
        Alcance semanal
      </PanelTitle>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 560, display: "block" }} role="img" aria-label="Alcance semanal">
        {points.map((p, i) => {
          const x = i * (W / points.length) + 2;
          const h = p.medianReach != null ? Math.max(3, ((H - PAD_B - PAD_T) * p.medianReach) / max) : 0;
          const y = H - PAD_B - h;
          const label = new Date(p.weekStart + "T00:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "numeric" });
          const isMax = i === maxIdx;
          return (
            <g key={p.weekStart}>
              {p.medianReach != null && (
                <rect x={x} y={y} width={barW} height={h} rx={3} fill={isMax ? "var(--accent)" : MARK}>
                  <title>{`Semana del ${label}: mediana ${fmt(p.medianReach)} · ${p.count} post${p.count !== 1 ? "s" : ""}`}</title>
                </rect>
              )}
              {isMax && (
                <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize={10} fill="var(--text)" fontWeight={700}>
                  {fmt(p.medianReach)}
                </text>
              )}
              {i % 2 === 0 && (
                <text x={x + barW / 2} y={H - 7} textAnchor="middle" fontSize={9} fill="var(--text-tertiary)">
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Seguidores (línea) ────────────────────────────────────────────────────────
export function FollowersChart({ points }: { points: { date: string; followers: number }[] }) {
  if (points.length < 2) {
    return (
      <div className="card">
        <PanelTitle>Evolución de seguidores</PanelTitle>
        <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
          Recolectando datos — el snapshot corre 3 veces por día. El gráfico aparece cuando haya al menos 2 días de historia.
        </p>
      </div>
    );
  }

  const W = 520, H = 150, PAD = 18, PAD_B = 22;
  const vals = points.map((p) => p.followers);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / Math.max(1, points.length - 1);
  const y = (v: number) => PAD + (H - PAD - PAD_B) * (1 - (v - min) / span);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.followers).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];

  return (
    <div className="card">
      <PanelTitle hint="Snapshot diario de la cuenta">Evolución de seguidores</PanelTitle>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 560, display: "block" }} role="img" aria-label="Evolución de seguidores">
        <path d={path} stroke={MARK} strokeWidth={2} fill="none" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={p.date} cx={x(i)} cy={y(p.followers)} r={4} fill={i === points.length - 1 ? "var(--accent)" : MARK}>
            <title>{`${new Date(p.date).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}: ${p.followers.toLocaleString()} seguidores`}</title>
          </circle>
        ))}
        <text x={x(points.length - 1)} y={y(last.followers) - 9} textAnchor="end" fontSize={11} fill="var(--text)" fontWeight={700}>
          {last.followers.toLocaleString()}
        </text>
        {points.map((p, i) =>
          i % Math.ceil(points.length / 6) === 0 ? (
            <text key={p.date} x={x(i)} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--text-tertiary)">
              {new Date(p.date).toLocaleDateString("es-AR", { day: "numeric", month: "numeric" })}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}

// ── Heatmap mejor día / franja ────────────────────────────────────────────────
export function BestTimeHeatmap({ cells, best }: { cells: HeatCell[]; best: HeatCell | null }) {
  const max = Math.max(1, ...cells.map((c) => c.median ?? 0));

  return (
    <div className="card">
      <PanelTitle hint="Mediana de alcance según cuándo publicaste (todos los posts con datos)">
        Mejor día y horario
      </PanelTitle>
      <div style={{ display: "grid", gridTemplateColumns: `44px repeat(4, 1fr)`, gap: 2, maxWidth: 420 }}>
        <div />
        {SLOT_LABELS.map((s) => (
          <div key={s} style={{ fontSize: "0.62rem", color: "var(--text-tertiary)", textAlign: "center", paddingBottom: 3 }}>{s}</div>
        ))}
        {DAY_LABELS.map((d, day) => (
          <div key={d} style={{ display: "contents" }}>
            <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)", display: "flex", alignItems: "center" }}>{d}</div>
            {cells
              .filter((c) => c.day === day)
              .map((c) => {
                const intensity = c.median != null ? 0.15 + 0.85 * (c.median / max) : 0;
                const isBest = best && c.day === best.day && c.slot === best.slot;
                return (
                  <div
                    key={`${c.day}-${c.slot}`}
                    title={
                      c.count > 0
                        ? `${d} ${SLOT_LABELS[c.slot]}: mediana ${fmt(c.median)} · ${c.count} post${c.count !== 1 ? "s" : ""}${c.count < 3 ? " (pocos datos)" : ""}`
                        : `${d} ${SLOT_LABELS[c.slot]}: sin posts`
                    }
                    style={{
                      height: 30,
                      borderRadius: 5,
                      background: c.median != null ? `rgba(204,117,8,${intensity.toFixed(2)})` : "rgba(255,255,255,0.03)",
                      border: isBest ? "2px solid var(--accent)" : "1px solid rgba(255,255,255,0.05)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.62rem",
                      color: "var(--text)",
                      fontWeight: isBest ? 700 : 400,
                      cursor: "default",
                    }}
                  >
                    {c.median != null ? fmt(c.median) : ""}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
      {best && (
        <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.75rem", marginBottom: 0 }}>
          Tu mejor franja: <strong style={{ color: "var(--accent)" }}>{DAY_LABELS[best.day]} {SLOT_LABELS[best.slot]}</strong>{" "}
          (mediana {fmt(best.median)} en {best.count} posts)
        </p>
      )}
    </div>
  );
}

// ── Diagnóstico de ganchos ────────────────────────────────────────────────────
function HookItem({ post, good }: { post: HookPost; good: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.4rem 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <span
        style={{
          fontSize: "0.72rem", fontWeight: 700, minWidth: 52, textAlign: "center",
          color: good ? "#22c55e" : "var(--danger)",
          background: good ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
          borderRadius: 6, padding: "0.2rem 0.3rem",
        }}
      >
        {post.skipRate.toFixed(0)}%
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {post.caption?.slice(0, 70) || <em>Sin caption</em>}
        </p>
        <span style={{ fontSize: "0.65rem", color: "var(--text-tertiary)" }}>
          watch {fmtSec(post.avgWatchTimeMs)} · alcance {fmt(post.reach)}
        </span>
      </div>
      {post.igPermalink && (
        <a href={post.igPermalink} target="_blank" rel="noreferrer" style={{ fontSize: "0.7rem", color: "var(--accent)", whiteSpace: "nowrap" }}>
          Ver →
        </a>
      )}
    </div>
  );
}

export function HookDiagnosis({ best, worst, medianSkip }: { best: HookPost[]; worst: HookPost[]; medianSkip: number | null }) {
  if (medianSkip == null) {
    return (
      <div className="card">
        <PanelTitle>Diagnóstico de ganchos</PanelTitle>
        <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>Sin datos de skip rate todavía.</p>
      </div>
    );
  }

  // Salud del gancho: <30% sano · 30-50% mejorable · >50% crítico
  const health =
    medianSkip < 30
      ? { icon: "✓", label: "Sano", color: "#22c55e" }
      : medianSkip <= 50
        ? { icon: "⚠", label: "Mejorable", color: "#eab308" }
        : { icon: "✕", label: "Crítico", color: "var(--danger)" };

  return (
    <div className="card">
      <PanelTitle hint="Skip% = cuántos saltaron el video sin verlo. El primer segundo decide.">
        Diagnóstico de ganchos
      </PanelTitle>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", marginBottom: "0.9rem" }}>
        <span style={{ fontSize: "1.5rem", fontWeight: 700, color: health.color }}>{medianSkip.toFixed(0)}%</span>
        <span style={{ fontSize: "0.75rem", color: health.color, fontWeight: 600 }}>{health.icon} {health.label}</span>
        <span style={{ fontSize: "0.68rem", color: "var(--text-tertiary)" }}>skip mediano · sano &lt;30% · crítico &gt;50%</span>
      </div>
      <div style={{ fontSize: "0.68rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
        Mejores ganchos
      </div>
      {best.map((p) => <HookItem key={p.id} post={p} good />)}
      <div style={{ fontSize: "0.68rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0.8rem 0 2px" }}>
        Peores ganchos
      </div>
      {worst.map((p) => <HookItem key={p.id} post={p} good={false} />)}
    </div>
  );
}

// ── Ranking de pilares de contenido ───────────────────────────────────────────
export function PillarLeaderboard({ stats }: { stats: PillarStat[] }) {
  if (stats.length === 0) {
    return (
      <div className="card">
        <PanelTitle hint="Necesita al menos 3 posts por pilar en el período para comparar de forma justa">
          Ranking de pilares
        </PanelTitle>
        <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
          Todavía no hay suficientes posts clasificados por pilar en este período.
        </p>
      </div>
    );
  }

  const maxER = Math.max(...stats.map((s) => s.erMediana ?? 0), 0.0001);

  return (
    <div className="card">
      <PanelTitle hint="Ordenado por Engagement Rate mediano · mínimo 3 posts por pilar">
        Ranking de pilares
      </PanelTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {stats.map((s, i) => {
          const pct = Math.max(4, ((s.erMediana ?? 0) / maxER) * 100);
          return (
            <div key={s.pillarId}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: i === 0 ? "var(--accent)" : "var(--text)" }}>
                  {i === 0 ? "🏆 " : ""}{s.label}
                </span>
                <span style={{ fontSize: "0.68rem", color: "var(--text-tertiary)" }}>
                  {s.posts} posts · alcance mediano {fmt(s.alcanceMediano)}
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: "var(--surface2)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: i === 0 ? "var(--accent)" : MARK, borderRadius: 4 }} />
              </div>
              <div style={{ display: "flex", gap: "1rem", marginTop: 4, fontSize: "0.65rem", color: "var(--text-tertiary)" }}>
                <span>ER {s.erMediana != null ? `${(s.erMediana * 100).toFixed(1)}%` : "—"}</span>
                <span>Guard. {s.saveRateMediana != null ? `${(s.saveRateMediana * 100).toFixed(2)}%` : "—"}</span>
                <span>Share {s.shareRateMediana != null ? `${(s.shareRateMediana * 100).toFixed(2)}%` : "—"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Rendimiento de hashtags ───────────────────────────────────────────────────
export function HashtagPerformance({ stats }: { stats: HashtagStat[] }) {
  if (stats.length === 0) {
    return (
      <div className="card">
        <PanelTitle hint="Necesita el mismo hashtag repetido en 2+ posts para comparar">
          Rendimiento de hashtags
        </PanelTitle>
        <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
          No se encontraron hashtags repetidos en los captions de este período.
        </p>
      </div>
    );
  }

  const maxReach = Math.max(...stats.map((s) => s.alcanceMediano ?? 0), 1);

  return (
    <div className="card">
      <PanelTitle hint="Hashtags usados en 2+ posts, ordenados por alcance mediano">
        Rendimiento de hashtags
      </PanelTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {stats.map((s) => {
          const pct = Math.max(4, ((s.alcanceMediano ?? 0) / maxReach) * 100);
          return (
            <div key={s.tag} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span
                style={{
                  fontSize: "0.74rem", color: "var(--accent)", minWidth: 110, maxWidth: 110,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
                title={s.tag}
              >
                {s.tag}
              </span>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--surface2)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: MARK, borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: "0.63rem", color: "var(--text-tertiary)", minWidth: 92, textAlign: "right" }}>
                {fmt(s.alcanceMediano)} · {s.posts}p
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
