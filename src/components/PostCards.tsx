"use client";

import { useState, useMemo } from "react";
import type { PostRow } from "./AnalyticsTable";

export type PostCardRow = PostRow & { mediaUrl: string | null };

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
function fmtSec(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const s = ms / 1000;
  return s >= 60 ? `${Math.floor(s / 60)}m${Math.round(s % 60)}s` : `${s.toFixed(1)}s`;
}
function er(r: PostCardRow): number | null {
  if (!r.reach) return null;
  return ((r.likeCount ?? 0) + (r.commentCount ?? 0) + (r.savedCount ?? 0) + (r.sharesCount ?? 0)) / r.reach;
}
function rate(num: number | null | undefined, denom: number | null | undefined): number | null {
  if (!denom || num == null) return null;
  return num / denom;
}

const TYPE_ICON: Record<string, string>  = { REELS: "▶", VIDEO: "▶", CAROUSEL_ALBUM: "⊞", IMAGE: "◻" };
const TYPE_LABEL: Record<string, string> = { REELS: "Reel", VIDEO: "Video", CAROUSEL_ALBUM: "Carrusel", IMAGE: "Imagen" };
const TYPE_COLOR: Record<string, string> = { REELS: "#f97316", VIDEO: "#3b82f6", CAROUSEL_ALBUM: "#a855f7", IMAGE: "#6b7280" };

type SortKey = "date" | "reach" | "er" | "saves" | "shares" | "plays";
const SORT_LABELS: { key: SortKey; label: string }[] = [
  { key: "date",   label: "Fecha" },
  { key: "reach",  label: "Alcance" },
  { key: "er",     label: "ER%" },
  { key: "saves",  label: "Guardados" },
  { key: "shares", label: "Shares" },
  { key: "plays",  label: "Vistas" },
];

function sortValue(r: PostCardRow, key: SortKey): number {
  switch (key) {
    case "date":   return r.publishedAt ? new Date(r.publishedAt).getTime() : 0;
    case "reach":  return r.reach ?? -1;
    case "er":     return er(r) ?? -1;
    case "saves":  return r.savedCount ?? -1;
    case "shares": return r.sharesCount ?? -1;
    case "plays":  return r.plays ?? -1;
  }
}

// ── Benchmark ────────────────────────────────────────────────────────────────
// Compara contra el promedio propio: ±30% define "típico".
// Así no se fuerza que siempre el 25% quede en rojo/verde —
// si todos los posts andan bien, la mayoría queda en gris.
type BmLevel = "top" | "typical" | "low";

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// invert=true: menor es mejor (ej. skip rate)
function bm(value: number | null, mean: number, invert = false): BmLevel | undefined {
  if (value == null || mean === 0) return undefined;
  const ratio = value / mean;
  if (invert) return ratio <= 0.7 ? "top" : ratio >= 1.3 ? "low" : "typical";
  return ratio >= 1.3 ? "top" : ratio <= 0.7 ? "low" : "typical";
}
const BM_LABEL: Record<BmLevel, string> = { top: "Valor más alto", typical: "Valor típico", low: "Valor más bajo" };
const BM_COLOR: Record<BmLevel, string> = { top: "#22c55e", typical: "#6b7280", low: "#ef4444" };

// ── Stat chip ─────────────────────────────────────────────────────────────────
function Stat({ label, value, accent, tooltip, benchmark }: {
  label: string; value: string; accent?: boolean; tooltip?: string; benchmark?: BmLevel;
}) {
  const [tip, setTip] = useState(false);
  return (
    <div
      style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", minWidth: 58, cursor: "help" }}
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
    >
      {tooltip && tip && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
          background: "#18181b", color: "#e4e4e7", fontSize: "0.72rem", lineHeight: 1.5,
          padding: "0.45rem 0.7rem", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)", whiteSpace: "normal", width: 210,
          textAlign: "center", zIndex: 50, pointerEvents: "none",
        }}>
          {tooltip}
        </div>
      )}
      <span style={{ fontWeight: 700, fontSize: "1.05rem", color: accent ? "var(--accent)" : "var(--text-primary)", letterSpacing: "-0.02em" }}>
        {value}
      </span>
      <span style={{ fontSize: "0.59rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 1 }}>
        {label}
      </span>
      {benchmark && (
        <span style={{ fontSize: "0.57rem", color: BM_COLOR[benchmark], fontWeight: 700, marginTop: 2 }}>
          {BM_LABEL[benchmark]}
        </span>
      )}
    </div>
  );
}

function Div() {
  return <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch", margin: "0 0.4rem" }} />;
}

// ── Retention curve (estimated from avgWatchTime + duration) ─────────────────
function RetentionCurve({ avgWatchMs, durationMs }: { avgWatchMs: number; durationMs: number }) {
  const A = avgWatchMs / 1000;
  const D = durationMs / 1000;
  if (D <= 0 || A <= 0) return null;
  const n = Math.max(0.3, D / A - 1);
  const W = 260, H = 56;
  const pts: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = (i / 60) * D;
    const retention = 100 * Math.pow(Math.max(0, 1 - t / D), n);
    pts.push(`${i === 0 ? "M" : "L"}${((t / D) * W).toFixed(1)},${(H - (retention / 100) * H).toFixed(1)}`);
  }
  const avgX = (A / D) * W;
  const avgRetention = 100 * Math.pow(Math.max(0, 1 - A / D), n);
  const avgY = H - (avgRetention / 100) * H;

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div style={{ fontSize: "0.62rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        Curva de retención estimada
      </div>
      <div style={{ position: "relative", display: "inline-block" }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", overflow: "visible" }}>
          {/* grid lines */}
          {[0, 50, 100].map(p => (
            <line key={p} x1={0} y1={H - (p / 100) * H} x2={W} y2={H - (p / 100) * H}
              stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          ))}
          {/* curve */}
          <path d={pts.join(" ")} stroke="var(--accent)" strokeWidth={2} fill="none" strokeLinecap="round" />
          {/* avg watch marker */}
          <line x1={avgX} y1={0} x2={avgX} y2={H} stroke="rgba(249,115,22,0.35)" strokeDasharray="3,2" strokeWidth={1} />
          <circle cx={avgX} cy={avgY} r={3} fill="var(--accent)" />
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.58rem", color: "var(--text-tertiary)", marginTop: 2 }}>
          <span>0s</span>
          <span style={{ color: "var(--accent)", fontWeight: 600 }}>avg {fmtSec(avgWatchMs)}</span>
          <span>{fmtSec(durationMs)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Follower split bar ────────────────────────────────────────────────────────
function FollowerBar({ followers, nonFollowers }: { followers: number; nonFollowers: number }) {
  const total = followers + nonFollowers;
  if (!total) return null;
  const followerPct = (followers / total) * 100;
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div style={{ fontSize: "0.62rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        Quién lo vio
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden", width: "100%", maxWidth: 260 }}>
        <div style={{ height: "100%", width: `${followerPct}%`, background: "var(--accent)", borderRadius: 3 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem", marginTop: 4, maxWidth: 260 }}>
        <span>
          <span style={{ color: "var(--accent)", fontWeight: 700 }}>{fmt(followers)}</span>
          <span style={{ color: "var(--text-tertiary)" }}> seguidores ({followerPct.toFixed(0)}%)</span>
        </span>
        <span>
          <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{fmt(nonFollowers)}</span>
          <span style={{ color: "var(--text-tertiary)" }}> nuevos</span>
        </span>
      </div>
    </div>
  );
}

// ── Thumbnail ─────────────────────────────────────────────────────────────────
function Thumbnail({ row }: { row: PostCardRow }) {
  const [failed, setFailed] = useState(false);
  const isVideo = row.mediaType === "REELS" || row.mediaType === "VIDEO";

  if (row.mediaUrl && !failed) {
    return (
      <div style={{ position: "relative", width: 112, minWidth: 112, height: 152, borderRadius: 10, overflow: "hidden", background: "#111" }}>
        {isVideo
          ? <video src={row.mediaUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }}
              muted playsInline preload="metadata" onError={() => setFailed(true)} />
          : <img src={row.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={() => setFailed(true)} />
        }
        {isVideo && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.9rem" }}>▶</div>
          </div>
        )}
      </div>
    );
  }

  const color = TYPE_COLOR[row.mediaType] ?? "#6b7280";
  return (
    <div style={{ width: 112, minWidth: 112, height: 152, borderRadius: 10, background: `${color}18`, border: `1px solid ${color}30`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
      <span style={{ fontSize: "1.8rem", color }}>{TYPE_ICON[row.mediaType] ?? "◻"}</span>
      <span style={{ fontSize: "0.65rem", color, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{TYPE_LABEL[row.mediaType] ?? row.mediaType}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function PostCards({ rows }: { rows: PostCardRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("date");

  const sorted = useMemo(
    () => [...rows].sort((a, b) => sortValue(b, sortKey) - sortValue(a, sortKey)),
    [rows, sortKey]
  );

  const benchmarkData = useMemo(() => {
    if (rows.length < 4) return null;
    const nums = (fn: (r: PostCardRow) => number | null) =>
      rows.map(fn).filter((v): v is number => v != null);

    return {
      reach:   avg(nums(r => r.reach)),
      er:      avg(nums(r => er(r))),
      sr:      avg(nums(r => rate(r.savedCount, r.reach))),
      watch:   avg(nums(r => r.avgWatchTimeMs)),
      play:    avg(nums(r => rate(r.plays, r.reach))),
      skip:    avg(nums(r => r.skipRate)),
      shares:  avg(nums(r => r.sharesCount)),
      follows: avg(nums(r => r.followsCount)),
    };
  }, [rows]);

  const isVideo = (r: PostCardRow) => r.mediaType === "REELS" || r.mediaType === "VIDEO";

  return (
    <div>
      {/* Sort bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Ordenar:</span>
        {SORT_LABELS.map(({ key, label }) => (
          <button key={key} onClick={() => setSortKey(key)} style={{
            padding: "0.25rem 0.75rem", borderRadius: 20, border: "1px solid",
            borderColor: sortKey === key ? "var(--accent)" : "var(--border)",
            background: sortKey === key ? "rgba(249,115,22,0.12)" : "transparent",
            color: sortKey === key ? "var(--accent)" : "var(--text-secondary)",
            fontSize: "0.75rem", fontWeight: sortKey === key ? 700 : 400, cursor: "pointer",
          }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        {sorted.map((row) => {
          const erVal  = er(row);
          const srVal  = rate(row.savedCount, row.reach);
          const prVal  = rate(row.plays, row.reach);
          const lrVal  = rate(row.likeCount, row.reach);
          const crVal  = rate(row.commentCount, row.reach);
          const shrVal = rate(row.sharesCount, row.reach);
          const video  = isVideo(row);
          const color  = TYPE_COLOR[row.mediaType] ?? "#6b7280";
          const erGood = erVal != null && erVal >= 0.05;
          const bd     = benchmarkData;

          return (
            <div key={row.id} style={{
              display: "flex", gap: "1.1rem", background: "var(--card)",
              border: "1px solid var(--border)", borderRadius: 14, padding: "1rem",
            }}>
              <Thumbnail row={row} />

              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em", background: `${color}18`, padding: "0.15rem 0.5rem", borderRadius: 20 }}>
                        {TYPE_LABEL[row.mediaType] ?? row.mediaType}
                      </span>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-tertiary)" }}>
                        {row.publishedAt
                          ? new Date(row.publishedAt).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })
                          : "—"}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {row.caption || <span style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>Sin caption</span>}
                    </p>
                  </div>
                  {row.igPermalink && (
                    <a href={row.igPermalink} target="_blank" rel="noreferrer"
                      style={{ fontSize: "0.72rem", color: "var(--accent)", whiteSpace: "nowrap", flexShrink: 0, padding: "0.25rem 0.6rem", border: "1px solid rgba(249,115,22,0.3)", borderRadius: 8 }}>
                      Ver →
                    </a>
                  )}
                </div>

                <div style={{ height: 1, background: "var(--border)" }} />

                {/* Fila 1: métricas absolutas principales */}
                <div style={{ display: "flex", gap: "0.15rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                  <Stat label="Alcance" value={fmt(row.reach)} accent={!!row.reach}
                    benchmark={bd ? bm(row.reach, bd.reach) : undefined}
                    tooltip="Personas únicas que vieron este post. Base para calcular todo lo demás." />
                  <Div />
                  <Stat label="ER%" value={erVal != null ? `${(erVal * 100).toFixed(1)}%` : "—"} accent={erGood}
                    benchmark={bd ? bm(erVal, bd.er) : undefined}
                    tooltip="Engagement Rate: de cada 100 personas que lo vieron, cuántas reaccionaron (likes + comentarios + guardados + compartidos). Arriba del 5% es muy bueno." />
                  {video && (
                    <><Div />
                      <Stat label="Vistas" value={fmt(row.plays)}
                        tooltip="Total de reproducciones. Puede superar el alcance si alguien lo vio más de una vez." />
                      <Stat label="Play%" value={prVal != null ? `${(prVal * 100).toFixed(1)}%` : "—"}
                        benchmark={bd ? bm(prVal, bd.play) : undefined}
                        tooltip="Reproducciones divididas por alcance. Más de 100% = la gente lo repitió. Cuanto más alto, mejor." />
                      <Stat label="Watch" value={fmtSec(row.avgWatchTimeMs)}
                        benchmark={bd ? bm(row.avgWatchTimeMs, bd.watch) : undefined}
                        tooltip="Tiempo promedio viendo el video antes de salir. Instagram premia los videos que retienen la atención." />
                      {row.skipRate != null && (
                        <Stat label="Skip%" value={`${row.skipRate.toFixed(1)}%`}
                          benchmark={bd ? bm(row.skipRate, bd.skip, true) : undefined}
                          tooltip="Porcentaje que saltó el video sin reproducirlo. Menos es mejor. Si es alto, la miniatura o el primer segundo no enganchan." />
                      )}
                    </>
                  )}
                  <Div />
                  <Stat label="Guard." value={fmt(row.savedCount)}
                    tooltip="Veces que alguien guardó el post. Señal más fuerte para el algoritmo." />
                  <Stat label="Shares" value={fmt(row.sharesCount)}
                    benchmark={bd ? bm(row.sharesCount, bd.shares) : undefined}
                    tooltip="Veces que compartieron por DM o historias. Cada share lleva tu contenido a personas que no te siguen." />
                  <Stat label="Likes" value={fmt(row.likeCount)}
                    tooltip="Cantidad de 'me gusta'. La interacción más básica." />
                  <Stat label="Coment." value={fmt(row.commentCount)}
                    tooltip="Cantidad de comentarios. El algoritmo los valora más que los likes." />
                  {row.repostsCount != null && (
                    <Stat label="Reposts" value={fmt(row.repostsCount)}
                      tooltip="Veces que alguien reposteó este contenido." />
                  )}
                  {row.followsCount != null && (
                    <><Div />
                      <Stat label="+Seg." value={fmt(row.followsCount)}
                        benchmark={bd ? bm(row.followsCount, bd.follows) : undefined}
                        tooltip="Personas que empezaron a seguirte después de ver este post." />
                    </>
                  )}
                  {row.profileVisits != null && (
                    <Stat label="Visitas" value={fmt(row.profileVisits)}
                      tooltip="Personas que fueron a ver tu perfil después de ver este post." />
                  )}
                </div>

                {/* Fila 2: tasas calculadas (%) */}
                <div style={{ display: "flex", gap: "0.15rem", flexWrap: "wrap", alignItems: "flex-start", paddingTop: "0.3rem", borderTop: "1px dashed rgba(255,255,255,0.06)" }}>
                  <Stat label="Guard.%" value={srVal != null ? `${(srVal * 100).toFixed(2)}%` : "—"}
                    benchmark={bd ? bm(srVal, bd.sr) : undefined}
                    tooltip="Guardados / alcance. La métrica más importante: si alguien guarda, Instagram impulsa masivamente el post." />
                  <Stat label="Like%" value={lrVal != null ? `${(lrVal * 100).toFixed(1)}%` : "—"}
                    tooltip="Likes divididos por alcance. De cada 100 personas que lo vieron, cuántas dieron like." />
                  <Stat label="Coment.%" value={crVal != null ? `${(crVal * 100).toFixed(2)}%` : "—"}
                    tooltip="Comentarios divididos por alcance. Pequeño porcentaje pero muy valioso para el algoritmo." />
                  <Stat label="Share%" value={shrVal != null ? `${(shrVal * 100).toFixed(2)}%` : "—"}
                    tooltip="Compartidos divididos por alcance. Si es alto, el contenido tiene alto potencial de viralización." />
                </div>

                {/* Follower bar + retention curve */}
                {(row.followersReach != null && row.nonFollowersReach != null) || (video && row.avgWatchTimeMs != null && row.videoDurationMs != null) ? (
                  <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", paddingTop: "0.2rem" }}>
                    {row.followersReach != null && row.nonFollowersReach != null && (
                      <FollowerBar followers={row.followersReach} nonFollowers={row.nonFollowersReach} />
                    )}
                    {video && row.avgWatchTimeMs != null && row.videoDurationMs != null && (
                      <RetentionCurve avgWatchMs={row.avgWatchTimeMs} durationMs={row.videoDurationMs} />
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
