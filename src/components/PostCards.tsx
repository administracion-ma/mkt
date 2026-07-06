"use client";

import { useState, useMemo } from "react";

export type PostCardRow = {
  id: number;
  pillarId?: number | null;
  publishedAt: string | null;
  mediaType: string;
  caption: string | null;
  igPermalink: string | null;
  mediaUrl: string | null;
  reach: number | null;
  plays: number | null;
  likeCount: number | null;
  commentCount: number | null;
  savedCount: number | null;
  sharesCount: number | null;
  repostsCount: number | null;
  avgWatchTimeMs: number | null;
  skipRate: number | null;
  followsCount: number | null;
  profileVisits: number | null;
  followersReach: number | null;
  nonFollowersReach: number | null;
  videoDurationMs: number | null;
};

export function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
export function fmtSec(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const s = ms / 1000;
  return s >= 60 ? `${Math.floor(s / 60)}m${Math.round(s % 60)}s` : `${s.toFixed(1)}s`;
}
export function er(r: PostCardRow): number | null {
  if (!r.reach) return null;
  return ((r.likeCount ?? 0) + (r.commentCount ?? 0) + (r.savedCount ?? 0) + (r.sharesCount ?? 0)) / r.reach;
}
export function rate(num: number | null | undefined, denom: number | null | undefined): number | null {
  if (!denom || num == null) return null;
  return num / denom;
}

export const TYPE_ICON: Record<string, string>  = { REELS: "▶", VIDEO: "▶", CAROUSEL_ALBUM: "⊞", IMAGE: "◻" };
export const TYPE_LABEL: Record<string, string> = { REELS: "Reel", VIDEO: "Video", CAROUSEL_ALBUM: "Carrusel", IMAGE: "Imagen" };
export const TYPE_COLOR: Record<string, string> = { REELS: "#f97316", VIDEO: "#3b82f6", CAROUSEL_ALBUM: "#a855f7", IMAGE: "#6b7280" };

type SortKey = "date" | "reach" | "er" | "saves" | "shares" | "plays" | "score";
const SORT_LABELS: { key: SortKey; label: string }[] = [
  { key: "date",   label: "Fecha" },
  { key: "score",  label: "Score" },
  { key: "reach",  label: "Alcance" },
  { key: "er",     label: "ER%" },
  { key: "saves",  label: "Guardados" },
  { key: "shares", label: "Shares" },
  { key: "plays",  label: "Vistas" },
];

function sortValue(r: PostCardRow, key: SortKey, scoreMap?: Map<number, number>): number {
  switch (key) {
    case "date":   return r.publishedAt ? new Date(r.publishedAt).getTime() : 0;
    case "score":  return scoreMap?.get(r.id) ?? -1;
    case "reach":  return r.reach ?? -1;
    case "er":     return er(r) ?? -1;
    case "saves":  return r.savedCount ?? -1;
    case "shares": return r.sharesCount ?? -1;
    case "plays":  return r.plays ?? -1;
  }
}

// median + límites del tercio inferior/superior de la propia distribución —
// permite clasificar "alto/medio/bajo" según cuánto varía cada métrica en la
// práctica, en vez de un margen fijo arbitrario (±30%) que no se ajusta a la
// dispersión real de cada señal.
export type MetricBand = { median: number; p33: number; p67: number } | null;
export type Benchmark = {
  reach: MetricBand; er: MetricBand; sr: MetricBand; lr: MetricBand; cr: MetricBand;
  shr: MetricBand; watch: MetricBand; play: MetricBand; skip: MetricBand; shares: MetricBand;
};

function percentile(sortedAsc: number[], p: number): number {
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

function band(values: number[]): MetricBand {
  if (values.length < 3) return null; // muestra insuficiente para terciles confiables
  const s = [...values].sort((a, b) => a - b);
  return { median: median(s), p33: percentile(s, 1 / 3), p67: percentile(s, 2 / 3) };
}

export const isVideo = (r: PostCardRow) => r.mediaType === "REELS" || r.mediaType === "VIDEO";

// Benchmark contra los últimos 10 posts DEL MISMO TIPO (igual que Instagram Edits: solo reels vs reels).
// Compartido entre la lista de detalle y la grilla para que el Score/benchmark sea el mismo en las dos vistas.
export function useAlgoScores(rows: PostCardRow[]): { benchmarkByType: { video: Benchmark | null; image: Benchmark | null }; scoreMap: Map<number, number> } {
  const benchmarkByType = useMemo(() => {
    const makePool = (filter: (r: PostCardRow) => boolean): Benchmark | null => {
      const pool = [...rows]
        .filter(r => r.publishedAt != null && filter(r))
        .sort((a, b) => (b.publishedAt! > a.publishedAt! ? 1 : -1))
        .slice(0, 10);
      if (pool.length < 3) return null;
      const nums = (fn: (r: PostCardRow) => number | null) =>
        pool.map(fn).filter((v): v is number => v != null);
      return {
        reach:   band(nums(r => r.reach)),
        er:      band(nums(r => er(r))),
        sr:      band(nums(r => rate(r.savedCount, r.reach))),
        lr:      band(nums(r => rate(r.likeCount, r.reach))),
        cr:      band(nums(r => rate(r.commentCount, r.reach))),
        shr:     band(nums(r => rate(r.sharesCount, r.reach))),
        watch:   band(nums(r => r.avgWatchTimeMs)),
        play:    band(nums(r => rate(r.plays, r.reach))),
        skip:    band(nums(r => r.skipRate)),
        shares:  band(nums(r => r.sharesCount)),
      };
    };
    return {
      video: makePool(r => isVideo(r)),
      image: makePool(r => r.mediaType === "IMAGE" || r.mediaType === "CAROUSEL_ALBUM"),
    };
  }, [rows]);

  const scoreMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of rows) {
      const bd = isVideo(r) ? benchmarkByType.video : benchmarkByType.image;
      const s = algoScore(r, bd, isVideo(r));
      if (s != null) m.set(r.id, s);
    }
    return m;
  }, [rows, benchmarkByType]);

  return { benchmarkByType, scoreMap };
}

// ── Algorithm Score ───────────────────────────────────────────────────────────
// Weighted composite based on 2026 Instagram signal hierarchy (Mosseri):
// Shares (#1) > Saves (#2) > Comments (#3) > Watch retention (#4) > Likes (#5)
// Score 0-100 vs last-10 median. Null if no reach data.
function algoScore(row: PostCardRow, bd: Benchmark | null, video: boolean): number | null {
  if (!row.reach || !bd) return null;

  const shrRate = rate(row.sharesCount, row.reach);
  const svRate  = rate(row.savedCount, row.reach);
  const cmtRate = rate(row.commentCount, row.reach);
  const lkRate  = rate(row.likeCount, row.reach);

  // Score metric 0-100 vs median: median = 50, 2x = 100, 0 = 0
  const sc = (val: number | null, mb: MetricBand, invert = false): number => {
    if (val == null || !mb || mb.median === 0) return 40; // neutral when no data
    const r = invert ? mb.median / Math.max(val, 0.001) : val / mb.median;
    return Math.min(100, Math.max(0, r * 50));
  };

  if (video) {
    return Math.round(
      sc(shrRate,  bd.shr)        * 0.28 +
      sc(svRate,   bd.sr)         * 0.22 +
      sc(cmtRate,  bd.cr)         * 0.15 +
      sc(row.avgWatchTimeMs, bd.watch) * 0.20 +
      sc(row.skipRate, bd.skip, true)  * 0.10 +
      sc(lkRate,   bd.lr)         * 0.05
    );
  }
  return Math.round(
    sc(shrRate, bd.shr) * 0.35 +
    sc(svRate,  bd.sr)  * 0.30 +
    sc(cmtRate, bd.cr)  * 0.20 +
    sc(lkRate,  bd.lr)  * 0.15
  );
}

// ── Benchmark ────────────────────────────────────────────────────────────────
// Terciles de la propia distribución (últimos ~10 posts del mismo tipo):
// "alto" = tercio superior, "bajo" = tercio inferior, el resto es "típico".
// Se ajusta solo a la dispersión real de cada métrica, en vez de asumir que
// todas varían lo mismo con un margen fijo.
export type BmLevel = "top" | "typical" | "low";

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

// invert=true: menor es mejor (ej. skip rate)
export function bm(value: number | null, mb: MetricBand, invert = false): BmLevel | undefined {
  if (value == null || !mb || mb.p33 === mb.p67) return undefined;
  if (invert) return value <= mb.p33 ? "top" : value >= mb.p67 ? "low" : "typical";
  return value >= mb.p67 ? "top" : value <= mb.p33 ? "low" : "typical";
}
const BM_LABEL: Record<BmLevel, string> = { top: "Valor más alto", typical: "Valor típico", low: "Valor más bajo" };
export const BM_COLOR: Record<BmLevel, string> = { top: "#22c55e", typical: "#6b7280", low: "#ef4444" };

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

// ── Bloque de stats completo de un post ──────────────────────────────────────
// Compartido entre la lista Detalle y el modal de detalle que se abre desde la Grilla.
export function PostDetailBlock({ row, bd, score }: { row: PostCardRow; bd: Benchmark | null; score: number | null }) {
  const erVal  = er(row);
  const srVal  = rate(row.savedCount, row.reach);
  const prVal  = rate(row.plays, row.reach);
  const lrVal  = rate(row.likeCount, row.reach);
  const crVal  = rate(row.commentCount, row.reach);
  const shrVal = rate(row.sharesCount, row.reach);
  const video  = isVideo(row);
  const color  = TYPE_COLOR[row.mediaType] ?? "#6b7280";
  const erGood = erVal != null && erVal >= 0.05;
  const isViral = bd?.reach && row.reach != null && row.reach >= bd.reach.median * 2.5;

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.65rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.68rem", fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em", background: `${color}18`, padding: "0.15rem 0.5rem", borderRadius: 20 }}>
              {TYPE_LABEL[row.mediaType] ?? row.mediaType}
            </span>
            <span style={{ fontSize: "0.72rem", color: "var(--text-tertiary)" }}>
              {row.publishedAt
                ? new Date(row.publishedAt).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })
                : "—"}
            </span>
            {isViral && (
              <span style={{ fontSize: "0.65rem", fontWeight: 700, background: "rgba(249,115,22,0.15)", color: "#f97316", border: "1px solid rgba(249,115,22,0.4)", padding: "0.1rem 0.5rem", borderRadius: 20 }}>
                VIRAL
              </span>
            )}
            {score != null && (
              <span title="Score de algoritmo: pesa share%, save%, comment%, watch time y like% según su importancia para el algoritmo de Instagram 2026"
                style={{
                  fontSize: "0.65rem", fontWeight: 700, padding: "0.1rem 0.5rem", borderRadius: 20,
                  background: score >= 70 ? "rgba(34,197,94,0.12)" : score >= 45 ? "rgba(107,114,128,0.12)" : "rgba(239,68,68,0.10)",
                  color: score >= 70 ? "#22c55e" : score >= 45 ? "#6b7280" : "#ef4444",
                  border: `1px solid ${score >= 70 ? "rgba(34,197,94,0.3)" : score >= 45 ? "rgba(107,114,128,0.25)" : "rgba(239,68,68,0.25)"}`,
                }}>
                Score {score}
              </span>
            )}
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
        {/* followsCount and profileVisits not available via Instagram Login API */}
      </div>

      {/* Fila 2: tasas por señal de algoritmo — ordenadas por peso 2026 */}
      <div style={{ display: "flex", gap: "0.15rem", flexWrap: "wrap", alignItems: "flex-start", paddingTop: "0.3rem", borderTop: "1px dashed rgba(255,255,255,0.06)" }}>
        <Stat label="Share%" value={shrVal != null ? `${(shrVal * 100).toFixed(2)}%` : "—"}
          benchmark={bd ? bm(shrVal, bd.shr) : undefined}
          tooltip="Señal #1 del algoritmo en 2026 (Adam Mosseri). Compartidos por alcance: cada share lleva tu contenido a personas nuevas." />
        <Stat label="Guard.%" value={srVal != null ? `${(srVal * 100).toFixed(2)}%` : "—"}
          benchmark={bd ? bm(srVal, bd.sr) : undefined}
          tooltip="Señal #2 del algoritmo. Guardados / alcance: si alguien guarda, Instagram impulsa masivamente el post." />
        <Stat label="Coment.%" value={crVal != null ? `${(crVal * 100).toFixed(2)}%` : "—"}
          benchmark={bd ? bm(crVal, bd.cr) : undefined}
          tooltip="Señal #3. Comentarios / alcance. Pequeño porcentaje pero muy valioso — más peso que los likes." />
        <Stat label="Like%" value={lrVal != null ? `${(lrVal * 100).toFixed(1)}%` : "—"}
          benchmark={bd ? bm(lrVal, bd.lr) : undefined}
          tooltip="Señal #4. Likes / alcance. La interacción más básica, la menos valorada por el algoritmo hoy." />
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
  );
}

// ── Thumbnail ─────────────────────────────────────────────────────────────────
export function Thumbnail({ row }: { row: PostCardRow }) {
  const [failed, setFailed] = useState(false);
  const isVideo = row.mediaType === "REELS" || row.mediaType === "VIDEO";

  if (row.mediaUrl && !failed) {
    const src = `/api/media/${row.id}`;
    return (
      <div style={{ position: "relative", width: 112, minWidth: 112, height: 152, borderRadius: 10, overflow: "hidden", background: "#111" }}>
        {isVideo
          ? <video src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }}
              muted playsInline preload="metadata" onError={() => setFailed(true)} />
          : <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
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
  const { benchmarkByType, scoreMap } = useAlgoScores(rows);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => sortValue(b, sortKey, scoreMap) - sortValue(a, sortKey, scoreMap)),
    [rows, sortKey, scoreMap]
  );

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
          const video = isVideo(row);
          const bd    = video ? benchmarkByType.video : benchmarkByType.image;
          const score = scoreMap.get(row.id) ?? null;

          return (
            <div key={row.id} style={{
              display: "flex", gap: "1.1rem", background: "var(--card)",
              border: "1px solid var(--border)", borderRadius: 14, padding: "1rem",
            }}>
              <Thumbnail row={row} />
              <PostDetailBlock row={row} bd={bd} score={score} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
