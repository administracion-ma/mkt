"use client";

import { useEffect, useRef, useState } from "react";
import type { PostCardRow } from "./PostCards";
import { fmt, er, TYPE_COLOR, TYPE_ICON, TYPE_LABEL } from "./PostCards";

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

function ReelTile({ row }: { row: PostCardRow }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const isVideo = row.mediaType === "REELS" || row.mediaType === "VIDEO";
  const color = TYPE_COLOR[row.mediaType] ?? "#6b7280";
  const erVal = er(row);

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
        onClick={isVideo ? toggle : undefined}
        style={{ cursor: isVideo ? "pointer" : "default" }}
      >
        {inView && src && !failed ? (
          isVideo ? (
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

        {isVideo && inView && !failed && !playing && (
          <div className="reel-tile-play-btn">▶</div>
        )}

        <span className="reel-tile-badge" style={{ color, borderColor: `${color}55`, background: "rgba(10,10,10,0.72)" }}>
          {TYPE_LABEL[row.mediaType] ?? row.mediaType}
        </span>

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
      </div>
    </div>
  );
}

export function ReelsGrid({ rows }: { rows: PostCardRow[] }) {
  return (
    <div className="reels-grid">
      {rows.map((row) => (
        <ReelTile key={row.id} row={row} />
      ))}
    </div>
  );
}
