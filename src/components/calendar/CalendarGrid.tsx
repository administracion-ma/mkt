"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarPost, Editor, Pillar } from "./types";
import { MEDIA_TYPE_ICON, STATUS_COLOR, pillarColor } from "./types";
import { NewPostModal, PostDetailModal } from "./PostModal";

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CalendarGrid({
  year, month, posts, pillars, editors, createPost, deletePost, publishPostNow,
}: {
  year: number;
  month: number; // 0-indexed
  posts: CalendarPost[];
  pillars: Pillar[];
  editors: Editor[];
  createPost: (formData: FormData) => Promise<void>;
  deletePost: (formData: FormData) => Promise<void>;
  publishPostNow: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [newPostDate, setNewPostDate] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);

  const todayKey = dateKey(new Date());

  const postsByDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const p of posts) {
      const key = dateKey(new Date(p.scheduledAt));
      (map.get(key) ?? map.set(key, []).get(key)!).push(p);
    }
    return map;
  }, [posts]);

  const weeks = useMemo(() => {
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7; // lunes=0
    const gridStart = new Date(year, month, 1 - startOffset);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
    }
    const out: Date[][] = [];
    for (let i = 0; i < 42; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [year, month]);

  function goToMonth(y: number, m: number) {
    const mm = String(m + 1).padStart(2, "0");
    router.push(`/calendar?month=${y}-${mm}`);
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <button onClick={() => goToMonth(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1)} className="btn btn-secondary" style={{ padding: "0.4rem 0.7rem" }}>
            ←
          </button>
          <h2 style={{ fontSize: "1.05rem", fontWeight: 700, textTransform: "capitalize", minWidth: 160, textAlign: "center", margin: 0 }}>
            {monthLabel}
          </h2>
          <button onClick={() => goToMonth(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1)} className="btn btn-secondary" style={{ padding: "0.4rem 0.7rem" }}>
            →
          </button>
          <button onClick={() => goToMonth(new Date().getFullYear(), new Date().getMonth())} className="btn btn-secondary">
            Hoy
          </button>
        </div>
        <button onClick={() => setNewPostDate(todayKey)} className="btn btn-primary">
          + Nuevo post
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {DAY_LABELS.map((d) => (
          <div key={d} style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--text-tertiary)", textAlign: "center", padding: "0.3rem 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateRows: `repeat(${weeks.length}, 1fr)`, gap: 3 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
            {week.map((day) => {
              const key = dateKey(day);
              const inMonth = day.getMonth() === month;
              const dayPosts = postsByDay.get(key) ?? [];
              const isEmpty = dayPosts.length === 0 && inMonth;
              const isToday = key === todayKey;
              const visible = dayPosts.slice(0, 3);
              const extra = dayPosts.length - visible.length;

              return (
                <div
                  key={key}
                  onClick={() => (dayPosts.length === 0 ? setNewPostDate(key) : undefined)}
                  style={{
                    minHeight: 92,
                    borderRadius: 8,
                    padding: "0.35rem",
                    background: !inMonth ? "transparent" : isEmpty ? "rgba(239,68,68,0.07)" : "var(--surface)",
                    border: `1px solid ${!inMonth ? "transparent" : isEmpty ? "rgba(239,68,68,0.25)" : "var(--border)"}`,
                    opacity: inMonth ? 1 : 0.35,
                    cursor: dayPosts.length === 0 && inMonth ? "pointer" : "default",
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: isToday ? 800 : 600,
                      color: isToday ? "var(--accent)" : isEmpty ? "#f87171" : "var(--text-secondary)",
                      alignSelf: "flex-start",
                    }}
                  >
                    {day.getDate()}
                  </span>
                  {visible.map((p) => {
                    const color = pillarColor(p.pillarId, pillars);
                    return (
                      <div
                        key={p.id}
                        onClick={(e) => { e.stopPropagation(); setSelectedPost(p); }}
                        title={p.caption}
                        style={{
                          fontSize: "0.62rem",
                          fontWeight: 600,
                          color: "#fff",
                          background: color,
                          borderLeft: `3px solid ${STATUS_COLOR[p.status]}`,
                          borderRadius: 4,
                          padding: "0.15rem 0.35rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          cursor: "pointer",
                        }}
                      >
                        {MEDIA_TYPE_ICON[p.mediaType]} {p.caption.slice(0, 22)}
                      </div>
                    );
                  })}
                  {extra > 0 && (
                    <span style={{ fontSize: "0.6rem", color: "var(--text-tertiary)", paddingLeft: "0.2rem" }}>+{extra} más</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Leyenda */}
      <div style={{ display: "flex", gap: "1.2rem", flexWrap: "wrap", marginTop: "1.25rem", fontSize: "0.7rem", color: "var(--text-tertiary)" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", marginRight: 5, verticalAlign: "-1px" }} />Sin nada programado</span>
        {pillars.map((p) => (
          <span key={p.id}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: pillarColor(p.id, pillars), marginRight: 5, verticalAlign: "-1px" }} />{p.label}</span>
        ))}
      </div>

      {newPostDate && (
        <NewPostModal
          defaultDate={newPostDate}
          pillars={pillars}
          editors={editors}
          onClose={() => setNewPostDate(null)}
          createPost={createPost}
        />
      )}
      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          pillars={pillars}
          editors={editors}
          onClose={() => setSelectedPost(null)}
          deletePost={deletePost}
          publishPostNow={publishPostNow}
        />
      )}
    </div>
  );
}
