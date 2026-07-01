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
function hookRate(r: PostCardRow): number | null {
  if (!r.reach || r.plays == null) return null;
  return r.plays / r.reach;
}

const TYPE_ICON: Record<string, string> = { REELS: "▶", VIDEO: "▶", CAROUSEL_ALBUM: "⊞", IMAGE: "◻" };
const TYPE_LABEL: Record<string, string> = { REELS: "Reel", VIDEO: "Video", CAROUSEL_ALBUM: "Carrusel", IMAGE: "Imagen" };
const TYPE_COLOR: Record<string, string> = { REELS: "#f97316", VIDEO: "#3b82f6", CAROUSEL_ALBUM: "#a855f7", IMAGE: "#6b7280" };

type SortKey = "date" | "reach" | "er" | "saves" | "shares" | "hook";
const SORT_LABELS: { key: SortKey; label: string }[] = [
  { key: "date",   label: "Fecha" },
  { key: "reach",  label: "Alcance" },
  { key: "er",     label: "ER%" },
  { key: "saves",  label: "Guardados" },
  { key: "shares", label: "Shares" },
  { key: "hook",   label: "Play%" },
];

function sortValue(r: PostCardRow, key: SortKey): number {
  switch (key) {
    case "date":   return r.publishedAt ? new Date(r.publishedAt).getTime() : 0;
    case "reach":  return r.reach ?? -1;
    case "er":     return er(r) ?? -1;
    case "saves":  return r.savedCount ?? -1;
    case "shares": return r.sharesCount ?? -1;
    case "hook":   return hookRate(r) ?? -1;
  }
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 56 }}>
      <span style={{ fontWeight: 700, fontSize: "1rem", color: accent ? "var(--accent)" : "var(--text-primary)", letterSpacing: "-0.02em" }}>
        {value}
      </span>
      <span style={{ fontSize: "0.6rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>
        {label}
      </span>
    </div>
  );
}

function Thumbnail({ row }: { row: PostCardRow }) {
  const [failed, setFailed] = useState(false);
  const isVideo = row.mediaType === "REELS" || row.mediaType === "VIDEO";

  if (row.mediaUrl && !failed) {
    return (
      <div style={{ position: "relative", width: 110, minWidth: 110, height: 148, borderRadius: 10, overflow: "hidden", background: "#111" }}>
        {isVideo ? (
          <video
            src={row.mediaUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            muted
            playsInline
            preload="metadata"
            onError={() => setFailed(true)}
          />
        ) : (
          <img
            src={row.mediaUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={() => setFailed(true)}
          />
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
    <div style={{ width: 110, minWidth: 110, height: 148, borderRadius: 10, background: `${color}18`, border: `1px solid ${color}30`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
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
          const erVal = er(row);
          const srVal = saveRate(row);
          const hrVal = hookRate(row);
          const video = isVideo(row);
          const color = TYPE_COLOR[row.mediaType] ?? "#6b7280";
          const erGood = erVal != null && erVal >= 0.05;

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
                transition: "border-color 0.15s",
              }}
            >
              {/* Thumbnail */}
              <Thumbnail row={row} />

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {/* Header row */}
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

                {/* Divider */}
                <div style={{ height: 1, background: "var(--border)" }} />

                {/* Stats */}
                <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                  <Stat label="Alcance" value={fmt(row.reach)} accent={!!row.reach} />
                  <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch", margin: "0 0.35rem" }} />
                  <Stat label="ER%" value={erVal != null ? `${(erVal * 100).toFixed(1)}%` : "—"} accent={erGood} />
                  {video && <><div style={{ width: 1, background: "var(--border)", alignSelf: "stretch", margin: "0 0.35rem" }} /><Stat label="Views" value={fmt(row.plays)} /></>}
                  {video && <Stat label="Play%" value={hrVal != null ? `${(hrVal * 100).toFixed(1)}%` : "—"} />}
                  {video && <Stat label="Watch" value={fmtSec(row.avgWatchTimeMs)} />}
                  {video && row.skipRate != null && <Stat label="Skip%" value={`${row.skipRate.toFixed(1)}%`} />}
                  <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch", margin: "0 0.35rem" }} />
                  <Stat label="Likes" value={fmt(row.likeCount)} />
                  <Stat label="Coment." value={fmt(row.commentCount)} />
                  <Stat label="Guard." value={fmt(row.savedCount)} />
                  <Stat label="Guard.%" value={srVal != null ? `${(srVal * 100).toFixed(2)}%` : "—"} />
                  <Stat label="Shares" value={fmt(row.sharesCount)} />
                  {row.followsCount != null && <><div style={{ width: 1, background: "var(--border)", alignSelf: "stretch", margin: "0 0.35rem" }} /><Stat label="+Seg." value={fmt(row.followsCount)} /></>}
                  {row.profileVisits != null && <Stat label="Visitas" value={fmt(row.profileVisits)} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
