"use client";

import { useState } from "react";

export function AnalyzeButton({
  initialSummary,
  initialCreatedAt,
}: {
  initialSummary: string | null;
  initialCreatedAt: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState(initialSummary);
  const [createdAt, setCreatedAt] = useState(initialCreatedAt);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", { method: "POST", body: JSON.stringify({}) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error al analizar");
      setSummary(body.summary);
      setCreatedAt(body.createdAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al analizar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: summary ? "1rem" : 0 }}>
        <div>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>Informe con IA</h3>
          <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", margin: "0.2rem 0 0" }}>
            {createdAt
              ? `Último informe: ${new Date(createdAt).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
              : "Últimos 30 días · analiza qué funcionó y qué no"}
          </p>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="btn btn-primary"
          style={{ whiteSpace: "nowrap" }}
        >
          {loading ? "Analizando…" : summary ? "↻ Analizar de nuevo" : "✨ Analizar"}
        </button>
      </div>
      {error && <p style={{ fontSize: "0.78rem", color: "var(--danger)", margin: 0 }}>{error}</p>}
      {summary && (
        <div style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", lineHeight: 1.65, color: "var(--text-secondary)" }}>
          {summary}
        </div>
      )}
    </div>
  );
}
