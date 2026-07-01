"use client";

import { useState, useMemo } from "react";

export type PostRow = {
  id: number;
  publishedAt: string | null;
  mediaType: string;
  caption: string | null;
  igPermalink: string | null;
  reach: number | null;
  plays: number | null;
  likeCount: number | null;
  commentCount: number | null;
  savedCount: number | null;
  sharesCount: number | null;
  avgWatchTimeMs: number | null;
  skipRate: number | null;
  followsCount: number | null;
  profileVisits: number | null;
};

const BADGE: Record<string, string> = {
  IMAGE: "badge-image",
  VIDEO: "badge-video",
  REELS: "badge-reel",
  CAROUSEL_ALBUM: "badge-image",
};
const LABEL: Record<string, string> = {
  IMAGE: "Imagen",
  VIDEO: "Video",
  REELS: "Reel",
  CAROUSEL_ALBUM: "Carrusel",
};

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(decimals)}%`;
}
function fmtSec(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const s = ms / 1000;
  return s >= 60 ? `${Math.floor(s / 60)}m${Math.round(s % 60)}s` : `${s.toFixed(1)}s`;
}

function er(row: PostRow): number | null {
  if (!row.reach) return null;
  const interactions = (row.likeCount ?? 0) + (row.commentCount ?? 0) + (row.savedCount ?? 0) + (row.sharesCount ?? 0);
  return interactions / row.reach;
}
function saveRate(row: PostRow): number | null {
  if (!row.reach || row.savedCount == null) return null;
  return row.savedCount / row.reach;
}
function hookRate(row: PostRow): number | null {
  if (!row.reach || row.plays == null) return null;
  return row.plays / row.reach;
}

type SortKey =
  | "publishedAt" | "reach" | "er" | "plays" | "hookRate"
  | "avgWatchTimeMs" | "skipRate" | "likeCount" | "commentCount"
  | "savedCount" | "saveRate" | "sharesCount" | "followsCount" | "profileVisits";

function getValue(row: PostRow, key: SortKey): number {
  switch (key) {
    case "publishedAt":   return row.publishedAt ? new Date(row.publishedAt).getTime() : 0;
    case "reach":         return row.reach ?? -1;
    case "er":            return er(row) ?? -1;
    case "plays":         return row.plays ?? -1;
    case "hookRate":      return hookRate(row) ?? -1;
    case "avgWatchTimeMs":return row.avgWatchTimeMs ?? -1;
    case "skipRate":      return row.skipRate ?? -1;
    case "likeCount":     return row.likeCount ?? -1;
    case "commentCount":  return row.commentCount ?? -1;
    case "savedCount":    return row.savedCount ?? -1;
    case "saveRate":      return saveRate(row) ?? -1;
    case "sharesCount":   return row.sharesCount ?? -1;
    case "followsCount":  return row.followsCount ?? -1;
    case "profileVisits": return row.profileVisits ?? -1;
  }
}

function Th({
  children, sortKey, current, dir, onSort, right,
}: {
  children: React.ReactNode;
  sortKey: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  right?: boolean;
}) {
  const active = current === sortKey;
  return (
    <th
      style={{ textAlign: right ? "right" : "left", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={() => onSort(sortKey)}
    >
      {children}{" "}
      <span style={{ opacity: active ? 1 : 0.25, fontSize: "0.65rem" }}>
        {active ? (dir === "desc" ? "▼" : "▲") : "▼"}
      </span>
    </th>
  );
}

export function AnalyticsTable({ rows }: { rows: PostRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("publishedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = getValue(a, sortKey);
      const bv = getValue(b, sortKey);
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [rows, sortKey, sortDir]);

  const isVideo = (r: PostRow) => r.mediaType === "VIDEO" || r.mediaType === "REELS";

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            <Th sortKey="publishedAt" current={sortKey} dir={sortDir} onSort={handleSort}>Fecha</Th>
            <th>Tipo</th>
            <th>Caption</th>
            <Th sortKey="reach"         current={sortKey} dir={sortDir} onSort={handleSort} right>Alcance</Th>
            <Th sortKey="er"            current={sortKey} dir={sortDir} onSort={handleSort} right>ER%</Th>
            <Th sortKey="plays"         current={sortKey} dir={sortDir} onSort={handleSort} right>Views</Th>
            <Th sortKey="hookRate"      current={sortKey} dir={sortDir} onSort={handleSort} right>Hook%</Th>
            <Th sortKey="avgWatchTimeMs"current={sortKey} dir={sortDir} onSort={handleSort} right>Avg Watch</Th>
            <Th sortKey="skipRate"      current={sortKey} dir={sortDir} onSort={handleSort} right>Skip%</Th>
            <Th sortKey="likeCount"     current={sortKey} dir={sortDir} onSort={handleSort} right>Likes</Th>
            <Th sortKey="commentCount"  current={sortKey} dir={sortDir} onSort={handleSort} right>Coment.</Th>
            <Th sortKey="savedCount"    current={sortKey} dir={sortDir} onSort={handleSort} right>Guard.</Th>
            <Th sortKey="saveRate"      current={sortKey} dir={sortDir} onSort={handleSort} right>Guard.%</Th>
            <Th sortKey="sharesCount"   current={sortKey} dir={sortDir} onSort={handleSort} right>Shares</Th>
            <Th sortKey="followsCount"  current={sortKey} dir={sortDir} onSort={handleSort} right>+Seg.</Th>
            <Th sortKey="profileVisits" current={sortKey} dir={sortDir} onSort={handleSort} right>Visitas</Th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const erVal = er(row);
            const srVal = saveRate(row);
            const hrVal = hookRate(row);
            const video = isVideo(row);
            return (
              <tr key={row.id}>
                <td className="muted" style={{ whiteSpace: "nowrap", fontSize: "0.775rem" }}>
                  {row.publishedAt
                    ? new Date(row.publishedAt).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })
                    : "—"}
                </td>
                <td>
                  <span className={`badge ${BADGE[row.mediaType] ?? "badge-image"}`}>
                    {LABEL[row.mediaType] ?? row.mediaType}
                  </span>
                </td>
                <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                  {row.caption || <span style={{ color: "var(--text-tertiary)" }}>Sin caption</span>}
                </td>
                <td className="num" style={{ color: row.reach ? "var(--accent)" : "var(--text-tertiary)", fontWeight: row.reach ? 600 : 400 }}>
                  {fmt(row.reach)}
                </td>
                <td className="num" style={{ fontWeight: 600, color: erVal != null ? (erVal >= 0.05 ? "var(--accent)" : "var(--text-primary)") : "var(--text-tertiary)" }}>
                  {erVal != null ? `${(erVal * 100).toFixed(1)}%` : "—"}
                </td>
                <td className="num muted">{video ? fmt(row.plays) : "—"}</td>
                <td className="num muted" style={{ fontSize: "0.78rem" }}>
                  {video ? (hrVal != null ? `${(hrVal * 100).toFixed(1)}%` : "—") : "—"}
                </td>
                <td className="num muted" style={{ fontSize: "0.78rem" }}>
                  {video ? fmtSec(row.avgWatchTimeMs) : "—"}
                </td>
                <td className="num muted" style={{ fontSize: "0.78rem" }}>
                  {video ? fmtPct(row.skipRate) : "—"}
                </td>
                <td className="num muted">{fmt(row.likeCount)}</td>
                <td className="num muted">{fmt(row.commentCount)}</td>
                <td className="num muted">{fmt(row.savedCount)}</td>
                <td className="num muted" style={{ fontSize: "0.78rem" }}>
                  {srVal != null ? `${(srVal * 100).toFixed(2)}%` : "—"}
                </td>
                <td className="num muted">{fmt(row.sharesCount)}</td>
                <td className="num muted">{fmt(row.followsCount)}</td>
                <td className="num muted">{fmt(row.profileVisits)}</td>
                <td>
                  {row.igPermalink && (
                    <a href={row.igPermalink} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                      Ver →
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
