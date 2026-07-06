"use client";

import { useEffect, useRef, useState } from "react";
import type { PostCardRow, Benchmark } from "./PostCards";
import { fmt, fmtSec, er, rate, bm, BM_COLOR, isVideo, useAlgoScores, TYPE_COLOR, TYPE_ICON, TYPE_LABEL, Thumbnail, PostDetailBlock } from "./PostCards";

// Monta el <video>/<img> recién cuando el tile entra en pantalla (+ margen) —
// con 30-60 posts en la grilla, cargar todo de una sería un montón de pedidos
// simultáneos al proxy de media.
function useInView<T extends HTMLElement>(rootMargin = "400px") {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setInView(true);
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}

function MiniStat({ label, value, level }: { label: string; value: string; level?: "top" | "typical" | "low" }) {
  return (
    <div className="reel-tile-mini-stat">
      <span className="reel-tile-mini-value" style={{ color: level ? BM_COLOR[level] : "var(--text)" }}>{value}</span>
      <span className="reel-tile-mini-label">{label}</span>
    </div>
  );
}

function ReelTile({ row, bd, score, onExpand }: { row: PostCardRow; bd: Benchmark | null; score: number | null; onExpand: () => void }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const video = isVideo(row);
  const color = TYPE_COLOR[row.mediaType] ?? "#6b7280";
  const erVal = er(row);
  const srVal = rate(row.savedCount, row.reach);
  const shrVal = rate(row.sharesCount, row.reach);
  const crVal = rate(row.commentCount, row.reach);

  function toggle() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.muted = false;
      v.play().catch(() => {});
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }

  const src = row.mediaUrl ? `/api/media/${row.id}` : null;

  return (
    <div ref={ref} className="reel-tile">
      <div
        className="reel-tile-media"
        onClick={video ? toggle : undefined}
        style={{ cursor: video ? "pointer" : "default" }}
      >
        {inView && src && !failed ? (
          video ? (
            <video
              ref={videoRef}
              src={src}
              className="reel-tile-video"
              muted
              loop
              playsInline
              preload="metadata"
              onPause={() => setPlaying(false)}
              onError={() => setFailed(true)}
            />
          ) : (
            <img src={src} alt="" className="reel-tile-video" onError={() => setFailed(true)} />
          )
        ) : (
          <div className="reel-tile-placeholder" style={{ background: `${color}18`, color }}>
            <span style={{ fontSize: "1.6rem" }}>{TYPE_ICON[row.mediaType] ?? "◻"}</span>
          </div>
        )}

        {video && inView && !failed && !playing && (
          <div className="reel-tile-play-btn">▶</div>
        )}

        <span className="reel-tile-badge" style={{ color, borderColor: `${color}55`, background: "rgba(10,10,10,0.72)" }}>
          {TYPE_LABEL[row.mediaType] ?? row.mediaType}
        </span>

        {score != null && (
          <span
            className="reel-tile-score"
            style={{
              color: score >= 70 ? "#22c55e" : score >= 45 ? "#9ca3af" : "#ef4444",
              borderColor: score >= 70 ? "rgba(34,197,94,0.4)" : score >= 45 ? "rgba(156,163,175,0.35)" : "rgba(239,68,68,0.4)",
            }}
            title="Score de algoritmo vs tus últimos posts del mismo tipo"
          >
            {score}
          </span>
        )}

        {row.igPermalink && (
          <a
            href={row.igPermalink}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="reel-tile-link"
            title="Ver en Instagram"
          >
            ↗
          </a>
        )}
      </div>

      <div className="reel-tile-meta">
        <span className="reel-tile-caption">
          {row.caption || <em style={{ color: "var(--text-tertiary)" }}>Sin caption</em>}
        </span>
        <div className="reel-tile-stats">
          <span>{row.publishedAt ? new Date(row.publishedAt).toLocaleDateString("es-AR", { day: "numeric", month: "short" }) : "—"}</span>
          <span>·</span>
          <span>👁 {fmt(row.reach)}</span>
          {erVal != null && (
            <>
              <span>·</span>
              <span style={{ color: erVal >= 0.05 ? "var(--accent)" : "var(--text-secondary)" }}>
                ER {(erVal * 100).toFixed(1)}%
              </span>
            </>
          )}
        </div>

        <div className="reel-tile-mini-grid">
          <MiniStat label="Guard." value={fmt(row.savedCount)} level={bd ? bm(srVal, bd.sr) : undefined} />
          <MiniStat label="Shares" value={fmt(row.sharesCount)} level={bd ? bm(shrVal, bd.shr) : undefined} />
          <MiniStat label="Coment." value={fmt(row.commentCount)} level={bd ? bm(crVal, bd.cr) : undefined} />
          {video && (
            <>
              <MiniStat label="Watch" value={fmtSec(row.avgWatchTimeMs)} level={bd ? bm(row.avgWatchTimeMs, bd.watch) : undefined} />
              {row.skipRate != null && (
                <MiniStat label="Skip%" value={`${row.skipRate.toFixed(0)}%`} level={bd ? bm(row.skipRate, bd.skip, true) : undefined} />
              )}
            </>
          )}
        </div>

        <button className="reel-tile-expand" onClick={onExpand}>
          Ver todas las métricas ↗
        </button>
      </div>
    </div>
  );
}

function ReelDetailModal({ row, bd, score, onClose }: { row: PostCardRow; bd: Benchmark | null; score: number | null; onClose: () => void }) {
  return (
    <div className="reel-modal-overlay" onClick={onClose}>
      <div className="reel-modal" onClick={(e) => e.stopPropagation()}>
        <button className="reel-modal-close" onClick={onClose}>✕</button>
        <div style={{ display: "flex", gap: "1.1rem", flexWrap: "wrap" }}>
          <Thumbnail row={row} />
          <PostDetailBlock row={row} bd={bd} score={score} />
        </div>
      </div>
    </div>
  );
}

export function ReelsGrid({ rows }: { rows: PostCardRow[] }) {
  const { benchmarkByType, scoreMap } = useAlgoScores(rows);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const expandedRow = expandedId != null ? rows.find((r) => r.id === expandedId) ?? null : null;
  const bdFor = (row: PostCardRow) => (isVideo(row) ? benchmarkByType.video : benchmarkByType.image);

  return (
    <>
      <div className="reels-grid">
        {rows.map((row) => (
          <ReelTile
            key={row.id}
            row={row}
            bd={bdFor(row)}
            score={scoreMap.get(row.id) ?? null}
            onExpand={() => setExpandedId(row.id)}
          />
        ))}
      </div>

      {expandedRow && (
        <ReelDetailModal
          row={expandedRow}
          bd={bdFor(expandedRow)}
          score={scoreMap.get(expandedRow.id) ?? null}
          onClose={() => setExpandedId(null)}
        />
      )}
    </>
  );
}
