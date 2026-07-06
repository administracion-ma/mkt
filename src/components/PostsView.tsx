"use client";

import { useState } from "react";
import { PostCards, type PostCardRow } from "./PostCards";
import { ReelsGrid } from "./ReelsGrid";

export function PostsView({ rows }: { rows: PostCardRow[] }) {
  const [view, setView] = useState<"grid" | "list">("grid");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1.25rem" }}>
        <div className="view-toggle">
          <button
            className={`view-toggle-btn${view === "grid" ? " active" : ""}`}
            onClick={() => setView("grid")}
          >
            ▦ Grilla
          </button>
          <button
            className={`view-toggle-btn${view === "list" ? " active" : ""}`}
            onClick={() => setView("list")}
          >
            ☰ Detalle
          </button>
        </div>
      </div>

      {view === "grid" ? <ReelsGrid rows={rows} /> : <PostCards rows={rows} />}
    </div>
  );
}
