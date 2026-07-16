"use client";

import { useState, useTransition } from "react";
import { saveGoals, type Goals } from "@/lib/goals/actions";

export function GoalsForm({ initial }: { initial: Goals | null }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setResult(null);
    startTransition(async () => {
      setResult(await saveGoals(formData));
    });
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid">
      <div className="form-row">
        <label>
          <span className="form-label">Presupuesto mensual de pauta (USD)</span>
          <input type="number" name="monthlyAdBudgetUsd" step="1" min="0" placeholder="500" className="form-input" defaultValue={initial?.monthlyAdBudgetUsd ?? ""} />
        </label>
        <label>
          <span className="form-label">Meta de ventas del mes (USD)</span>
          <input type="number" name="monthlySalesTargetUsd" step="1" min="0" placeholder="10000" className="form-input" defaultValue={initial?.monthlySalesTargetUsd ?? ""} />
        </label>
      </div>
      <label style={{ maxWidth: 280 }}>
        <span className="form-label">Posts por semana (objetivo)</span>
        <input type="number" name="weeklyPostsTarget" step="1" min="0" placeholder="4" className="form-input" defaultValue={initial?.weeklyPostsTarget ?? ""} />
      </label>
      <button type="submit" disabled={pending} className="btn btn-primary" style={{ justifySelf: "start" }}>
        {pending ? "Guardando…" : "Guardar metas"}
      </button>
      {result && (
        <p style={{ fontSize: "0.78rem", color: result.ok ? "var(--success)" : "var(--danger)", margin: 0 }}>
          {result.ok ? "✓ " : "✕ "}{result.message}
        </p>
      )}
    </form>
  );
}
