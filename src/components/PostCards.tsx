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
function saveRate(r: PostCardRow): number | null {
  if (!r.reach || r.savedCount == null) return null;
  return r.savedCount / r.reach;
}
function playRate(r: PostCardRow): number | null {
  if (!r.reach || r.plays == null) return null;
  return r.plays / r.reach;
}

const TYPE_ICON: Record<string, string> = { REELS: "▶", VIDEO: "▶", CAROUSEL_ALBUM: "⊞", IMAGE: "◻" };
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

type BmLevel = "top" | "typical" | "low";

function pct(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length * p)] ?? s[s.length - 1];
}

function bm(value: number | null, lo: number, hi: number, invert = false): BmLevel | undefined {
  if (value == null || lo === hi) return undefined;
  if (invert) return value <= lo ? "top" : value >= hi ? "low" : "typical";
  return value >= hi ? "top" : value <= lo ? "low" : "typical";
}

const BM_LABEL: Record<BmLevel, string> = {
  top:     "Valor más alto",
  typical: "Valor típico",
  low:     "Valor más bajo",
};
const BM_COLOR: Record<BmLevel, string> = {
  top:     "#22c55e",
  typical: "#6b7280",
  low:     "#ef4444",
};

function Stat({
  label, value, accent, tooltip, benchmark,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tooltip?: string;
  benchmark?: BmLevel;
}) {
  const [tip, setTip] = useState(false);
  return (
    <div
      style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", minWidth: 60, cursor: "help" }}
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
    >
      {tooltip && tip && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 8px)",
          left: "50%",
          transform: "translateX(-50%)",
          background: "#18181b",
          color: "#e4e4e7",
          fontSize: "0.72rem",
          lineHeight: 1.5,
          padding: "0.45rem 0.7rem",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          whiteSpace: "normal",
          width: 210,
          textAlign: "center",
          zIndex: 50,
          pointerEvents: "none",
        }}>
          {tooltip}
        </div>
      )}
      <span style={{ fontWeight: 700, fontSize: "1.05rem", color: accent ? "var(--accent)" : "var(--text-primary)", letterSpacing: "-0.02em" }}>
        {value}
      </span>
      <span style={{ fontSize: "0.6rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 1 }}>
        {label}
      </span>
      {benchmark && (
        <span style={{ fontSize: "0.58rem", color: BM_COLOR[benchmark], fontWeight: 700, marginTop: 2, letterSpacing: "0.02em" }}>
          {BM_LABEL[benchmark]}
        </span>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch", margin: "0 0.4rem" }} />;
}

function Thumbnail({ row }: { row: PostCardRow }) {
  const [failed, setFailed] = useState(false);
  const isVideo = row.mediaType === "REELS" || row.mediaType === "VIDEO";

  if (row.mediaUrl && !failed) {
    return (
      <div style={{ position: "relative", width: 112, minWidth: 112, height: 150, borderRadius: 10, overflow: "hidden", background: "#111" }}>
        {isVideo ? (
          <video src={row.mediaUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }}
            muted playsInline preload="metadata" onError={() => setFailed(true)} />
        ) : (
          <img src={row.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={() => setFailed(true)} />
        )}
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
    <div style={{ width: 112, minWidth: 112, height: 150, borderRadius: 10, background: `${color}18`, border: `1px solid ${color}30`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
      <span style={{ fontSize: "1.8rem", color }}>{TYPE_ICON[row.mediaType] ?? "◻"}</span>
      <span style={{ fontSize: "0.65rem", color, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{TYPE_LABEL[row.mediaType] ?? row.mediaType}</span>
    </div>
  );
}

export function PostCards({ rows }: { rows: PostCardRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("date");

  const sorted = useMemo(
    () => [...rows].sort((a, b) => sortValue(b, sortKey) - sortValue(a, sortKey)),
    [rows, sortKey]
  );

  // Compute percentiles across all posts (need ≥4 posts for benchmarks to be meaningful)
  const benchmarkData = useMemo(() => {
    if (rows.length < 4) return null;
    const nums = (fn: (r: PostCardRow) => number | null) =>
      rows.map(fn).filter((v): v is number => v != null);

    const reaches   = nums(r => r.reach);
    const erVals    = nums(r => er(r));
    const srVals    = nums(r => saveRate(r));
    const watchVals = nums(r => r.avgWatchTimeMs);
    const prVals    = nums(r => playRate(r));
    const skipVals  = nums(r => r.skipRate);
    const shareVals = nums(r => r.sharesCount);
    const followVals= nums(r => r.followsCount);

    return {
      reach:   { lo: pct(reaches, 0.25),   hi: pct(reaches, 0.75) },
      er:      { lo: pct(erVals, 0.25),     hi: pct(erVals, 0.75) },
      sr:      { lo: pct(srVals, 0.25),     hi: pct(srVals, 0.75) },
      watch:   { lo: pct(watchVals, 0.25),  hi: pct(watchVals, 0.75) },
      play:    { lo: pct(prVals, 0.25),     hi: pct(prVals, 0.75) },
      skip:    { lo: pct(skipVals, 0.25),   hi: pct(skipVals, 0.75) },
      shares:  { lo: pct(shareVals, 0.25),  hi: pct(shareVals, 0.75) },
      follows: { lo: pct(followVals, 0.25), hi: pct(followVals, 0.75) },
    };
  }, [rows]);

  const isVideo = (r: PostCardRow) => r.mediaType === "REELS" || r.mediaType === "VIDEO";

  return (
    <div>
      {/* Sort bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Ordenar:</span>
        {SORT_LABELS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            style={{
              padding: "0.25rem 0.75rem",
              borderRadius: 20,
              border: "1px solid",
              borderColor: sortKey === key ? "var(--accent)" : "var(--border)",
              background: sortKey === key ? "rgba(249,115,22,0.12)" : "transparent",
              color: sortKey === key ? "var(--accent)" : "var(--text-secondary)",
              fontSize: "0.75rem",
              fontWeight: sortKey === key ? 700 : 400,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        {sorted.map((row) => {
          const erVal  = er(row);
          const srVal  = saveRate(row);
          const prVal  = playRate(row);
          const video  = isVideo(row);
          const color  = TYPE_COLOR[row.mediaType] ?? "#6b7280";
          const erGood = erVal != null && erVal >= 0.05;
          const bd     = benchmarkData;

          return (
            <div
              key={row.id}
              style={{
                display: "flex",
                gap: "1.1rem",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: "1rem",
              }}
            >
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

                {/* Stats */}
                <div style={{ display: "flex", gap: "0.15rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                  <Stat
                    label="Alcance"
                    value={fmt(row.reach)}
                    accent={!!row.reach}
                    benchmark={bd ? bm(row.reach, bd.reach.lo, bd.reach.hi) : undefined}
                    tooltip="Personas únicas que vieron este post. Base para calcular todo lo demás."
                  />
                  <Divider />
                  <Stat
                    label="ER%"
                    value={erVal != null ? `${(erVal * 100).toFixed(1)}%` : "—"}
                    accent={erGood}
                    benchmark={bd ? bm(erVal, bd.er.lo, bd.er.hi) : undefined}
                    tooltip="Engagement Rate: de cada 100 personas que lo vieron, cuántas reaccionaron (likes + comentarios + guardados + compartidos). Arriba del 5% es muy bueno."
                  />
                  {video && <><Divider />
                    <Stat
                      label="Vistas"
                      value={fmt(row.plays)}
                      benchmark={bd ? bm(row.plays, bd.reach.lo, bd.reach.hi) : undefined}
                      tooltip="Veces que se reprodujo el video. Puede superar el alcance si alguien lo ve más de una vez."
                    />
                    <Stat
                      label="Play%"
                      value={prVal != null ? `${(prVal * 100).toFixed(1)}%` : "—"}
                      benchmark={bd ? bm(prVal, bd.play.lo, bd.play.hi) : undefined}
                      tooltip="Reproducciones divididas por alcance. Más de 100% significa que la gente lo repitió. Cuanto más alto, más atrapó la atención."
                    />
                    <Stat
                      label="Watch"
                      value={fmtSec(row.avgWatchTimeMs)}
                      benchmark={bd ? bm(row.avgWatchTimeMs, bd.watch.lo, bd.watch.hi) : undefined}
                      tooltip="Tiempo promedio que cada persona vio el video. Cuanto más alto, mejor: Instagram premia los videos que retienen la atención."
                    />
                    {row.skipRate != null && (
                      <Stat
                        label="Skip%"
                        value={`${row.skipRate.toFixed(1)}%`}
                        benchmark={bd ? bm(row.skipRate, bd.skip.lo, bd.skip.hi, true) : undefined}
                        tooltip="Porcentaje que saltó el video sin verlo. Menos es mejor. Si es alto, la miniatura o el primer segundo no enganchan."
                      />
                    )}
                  </>}
                  <Divider />
                  <Stat
                    label="Likes"
                    value={fmt(row.likeCount)}
                    tooltip="Cantidad de 'me gusta'. La interacción más básica."
                  />
                  <Stat
                    label="Coment."
                    value={fmt(row.commentCount)}
                    tooltip="Cantidad de comentarios. El algoritmo los valora más que los likes porque requieren mayor esfuerzo."
                  />
                  <Stat
                    label="Guard."
                    value={fmt(row.savedCount)}
                    tooltip="Veces que alguien guardó el post. Señal muy fuerte para el algoritmo de Instagram."
                  />
                  <Stat
                    label="Guard.%"
                    value={srVal != null ? `${(srVal * 100).toFixed(2)}%` : "—"}
                    benchmark={bd ? bm(srVal, bd.sr.lo, bd.sr.hi) : undefined}
                    tooltip="Guardados dividido por alcance. La métrica más importante: si alguien guarda, Instagram impulsa masivamente el post."
                  />
                  <Stat
                    label="Shares"
                    value={fmt(row.sharesCount)}
                    benchmark={bd ? bm(row.sharesCount, bd.shares.lo, bd.shares.hi) : undefined}
                    tooltip="Veces que compartieron el post por DM o en historias. Cada share lleva tu contenido a personas que no te siguen."
                  />
                  {row.followsCount != null && (
                    <><Divider />
                      <Stat
                        label="+Seg."
                        value={fmt(row.followsCount)}
                        benchmark={bd ? bm(row.followsCount, bd.follows.lo, bd.follows.hi) : undefined}
                        tooltip="Personas que empezaron a seguirte después de ver este post. Qué contenido convierte visitantes en seguidores."
                      />
                    </>
                  )}
                  {row.profileVisits != null && (
                    <Stat
                      label="Visitas"
                      value={fmt(row.profileVisits)}
                      tooltip="Personas que fueron a ver tu perfil después de ver este post."
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
