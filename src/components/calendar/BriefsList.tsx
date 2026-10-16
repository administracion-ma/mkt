"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarPost, Editor, Pillar } from "./types";
import {
  CHANNEL_LABEL,
  FORMAT_LABEL,
  PRODUCTION_STATUS_COLOR,
  PRODUCTION_STATUS_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  pillarColor,
} from "./types";

const CHANNEL_FILTERS: Array<{ key: string; label: string }> = [
  { key: "ALL", label: "Todos" },
  { key: "YOUTUBE", label: "YouTube" },
  { key: "VERTICAL", label: "Vertical" },
  { key: "SOLO_TIKTOK", label: "Solo TikTok" },
  { key: "PAUTA", label: "Pauta" },
];

function fmtDay(iso: string): { day: string; weekday: string; month: string } {
  const d = new Date(iso);
  return {
    day: String(d.getDate()),
    weekday: d.toLocaleDateString("es-AR", { weekday: "short" }),
    month: d.toLocaleDateString("es-AR", { month: "short" }),
  };
}

// Vista plana (no grilla) de los briefs del mes — pensada para repasar de una
// sola pantalla todo lo planificado de un canal, sin tener que ir día por día
// como en la Grilla. El texto completo del brief (caption) queda visible, sin
// truncar: acá el objetivo es leerlo, no solo ubicarlo en el calendario.
export function BriefsList({
  year, month, posts, pillars, editors,
}: {
  year: number;
  month: number; // 0-indexed
  posts: CalendarPost[]; // ya filtrados al mes exacto (sin relleno de días adyacentes)
  pillars: Pillar[];
  editors: Editor[];
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<string>("YOUTUBE");

  const pillarById = useMemo(() => new Map(pillars.map((p) => [p.id, p])), [pillars]);
  const editorById = useMemo(() => new Map(editors.map((e) => [e.id, e])), [editors]);

  const filtered = useMemo(() => {
    const rows = channel === "ALL" ? posts : posts.filter((p) => p.channel === channel);
    return [...rows].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }, [posts, channel]);

  function goToMonth(y: number, m: number) {
    const mm = String(m + 1).padStart(2, "0");
    router.push(`/calendar?month=${y}-${mm}&view=briefs`);
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <button className="btn btn-secondary" style={{ padding: "0.4rem 0.7rem" }} onClick={() => goToMonth(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1)}>←</button>
          <strong style={{ textTransform: "capitalize", fontSize: "0.95rem" }}>{monthLabel}</strong>
          <button className="btn btn-secondary" style={{ padding: "0.4rem 0.7rem" }} onClick={() => goToMonth(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1)}>→</button>
        </div>

        <div className="view-toggle">
          {CHANNEL_FILTERS.map((c) => (
            <button
              key={c.key}
              className={`view-toggle-btn${channel === c.key ? " active" : ""}`}
              onClick={() => setChannel(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📋</div>
          <p>
            No hay contenido planificado de {channel === "ALL" ? "ningún canal" : CHANNEL_LABEL[channel] ?? channel}{" "}
            para {monthLabel}.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          {filtered.map((p) => {
            const { day, weekday, month: monthShort } = fmtDay(p.scheduledAt);
            const pillar = pillarById.get(p.pillarId);
            const editor = p.editorId != null ? editorById.get(p.editorId) : null;
            return (
              <div key={p.id} className="card" style={{ display: "flex", gap: "1rem", padding: "0.9rem 1.1rem" }}>
                <div style={{ flexShrink: 0, width: 46, textAlign: "center" }}>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700, lineHeight: 1 }}>{day}</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--text-tertiary)", textTransform: "capitalize" }}>
                    {weekday} {monthShort}
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center", marginBottom: "0.4rem" }}>
                    {pillar && (
                      <span style={{ fontSize: "0.68rem", padding: "0.15rem 0.5rem", borderRadius: 20, background: `${pillarColor(p.pillarId, pillars)}22`, color: pillarColor(p.pillarId, pillars), fontWeight: 600 }}>
                        {pillar.label}
                      </span>
                    )}
                    {p.channel && (
                      <span style={{ fontSize: "0.68rem", padding: "0.15rem 0.5rem", borderRadius: 20, background: "var(--surface2)", color: "var(--text-secondary)" }}>
                        {CHANNEL_LABEL[p.channel] ?? p.channel}
                      </span>
                    )}
                    {p.format && (
                      <span style={{ fontSize: "0.68rem", padding: "0.15rem 0.5rem", borderRadius: 20, background: "var(--surface2)", color: "var(--text-secondary)" }}>
                        {FORMAT_LABEL[p.format] ?? p.format}
                      </span>
                    )}
                    {p.productionStatus && (
                      <span style={{ fontSize: "0.68rem", padding: "0.15rem 0.5rem", borderRadius: 20, background: `${PRODUCTION_STATUS_COLOR[p.productionStatus]}22`, color: PRODUCTION_STATUS_COLOR[p.productionStatus], fontWeight: 600 }}>
                        {PRODUCTION_STATUS_LABEL[p.productionStatus] ?? p.productionStatus}
                      </span>
                    )}
                    {editor && (
                      <span style={{ fontSize: "0.68rem", color: "var(--text-tertiary)" }}>· {editor.label}</span>
                    )}
                    <span style={{ fontSize: "0.68rem", marginLeft: "auto", color: STATUS_COLOR[p.status] ?? "var(--text-tertiary)", fontWeight: 600 }}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </div>

                  <p style={{ fontSize: "0.85rem", whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.5 }}>{p.caption || "(sin texto cargado)"}</p>

                  <div style={{ display: "flex", gap: "0.9rem", marginTop: "0.5rem" }}>
                    {p.rawFootageUrl && (
                      <a href={p.rawFootageUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.72rem", color: "var(--accent)" }}>
                        🎬 Material
                      </a>
                    )}
                    {p.igPermalink && (
                      <a href={p.igPermalink} target="_blank" rel="noreferrer" style={{ fontSize: "0.72rem", color: "var(--accent)" }}>
                        ↗ Ver publicado
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
