"use client";

import { useState } from "react";
import { CalendarGrid, type BestTimeHint } from "./CalendarGrid";
import { BriefsList } from "./BriefsList";
import type { CalendarPost, Editor, Pillar } from "./types";

export function CalendarView({
  year, month, gridPosts, monthPosts, pillars, editors, bestTime,
  createPost, deletePost, publishPostNow, initialView,
}: {
  year: number;
  month: number;
  gridPosts: CalendarPost[]; // con relleno de días adyacentes, para la Grilla
  monthPosts: CalendarPost[]; // acotado al mes exacto, para Briefs
  pillars: Pillar[];
  editors: Editor[];
  bestTime: BestTimeHint | null;
  createPost: (formData: FormData) => Promise<void>;
  deletePost: (formData: FormData) => Promise<void>;
  publishPostNow: (formData: FormData) => Promise<void>;
  initialView: "grid" | "briefs";
}) {
  const [view, setView] = useState<"grid" | "briefs">(initialView);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
        <div className="view-toggle">
          <button className={`view-toggle-btn${view === "grid" ? " active" : ""}`} onClick={() => setView("grid")}>
            🗓️ Grilla
          </button>
          <button className={`view-toggle-btn${view === "briefs" ? " active" : ""}`} onClick={() => setView("briefs")}>
            📋 Briefs
          </button>
        </div>
      </div>

      {view === "grid" ? (
        <CalendarGrid
          year={year}
          month={month}
          posts={gridPosts}
          pillars={pillars}
          editors={editors}
          bestTime={bestTime}
          createPost={createPost}
          deletePost={deletePost}
          publishPostNow={publishPostNow}
        />
      ) : (
        <BriefsList year={year} month={month} posts={monthPosts} pillars={pillars} editors={editors} />
      )}
    </div>
  );
}
