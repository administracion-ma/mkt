"use client";

import { useTransition } from "react";
import { setActionItemStatus } from "@/lib/action-items/actions";

export type ActionItemRow = { id: number; source: string; text: string };

const SOURCE_LABEL: Record<string, string> = { organic: "📷", ads: "📢" };

export function ActionItemsList({ items }: { items: ActionItemRow[] }) {
  const [pending, startTransition] = useTransition();

  function update(id: number, status: "done" | "dismissed") {
    startTransition(async () => {
      await setActionItemStatus(id, status);
    });
  }

  if (items.length === 0) {
    return <p style={{ color: "var(--text-tertiary)", fontSize: "0.85rem", margin: 0 }}>Sin acciones pendientes — todo al día. 🎉</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            display: "flex", alignItems: "flex-start", gap: "0.6rem",
            padding: "0.65rem 0.85rem", background: "var(--surface2)", borderRadius: 8,
            opacity: pending ? 0.6 : 1,
          }}
        >
          <span style={{ fontSize: "0.8rem", marginTop: "0.1rem", flexShrink: 0 }}>{SOURCE_LABEL[item.source] ?? "•"}</span>
          <p style={{ margin: 0, fontSize: "0.85rem", flex: 1, lineHeight: 1.45 }}>{item.text}</p>
          <div style={{ display: "flex", gap: "0.3rem", flexShrink: 0 }}>
            <button
              type="button"
              disabled={pending}
              onClick={() => update(item.id, "done")}
              className="btn-ghost"
              style={{ fontSize: "0.7rem", color: "var(--success)" }}
              title="Marcar como hecho"
            >
              ✓ Hecho
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => update(item.id, "dismissed")}
              className="btn-ghost"
              style={{ fontSize: "0.7rem" }}
              title="Descartar"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
