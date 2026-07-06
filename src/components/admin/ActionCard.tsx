"use client";

import { useState, useTransition } from "react";

export function ActionCard({
  title, description, buttonLabel, action,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  action: () => Promise<{ ok: boolean; message: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const r = await action();
      setResult(r);
    });
  }

  return (
    <div className="card" style={{ marginBottom: "1.25rem" }}>
      <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.3rem" }}>{title}</h3>
      <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 1rem" }}>{description}</p>
      <button onClick={handleClick} disabled={pending} className="btn btn-primary">
        {pending ? "Ejecutando…" : buttonLabel}
      </button>
      {result && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem",
            borderRadius: 8,
            background: result.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${result.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            fontSize: "0.78rem",
            color: result.ok ? "#22c55e" : "var(--danger)",
            whiteSpace: "pre-wrap",
          }}
        >
          {result.ok ? "✓ " : "✕ "}{result.message}
        </div>
      )}
    </div>
  );
}
