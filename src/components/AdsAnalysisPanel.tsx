"use client";

import { useState } from "react";

export function AdsAnalysisPanel({
  initialSummary,
  initialCreatedAt,
  from,
  to,
}: {
  initialSummary: string | null;
  initialCreatedAt: string | null;
  from?: string;
  to?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState(initialSummary);
  const [createdAt, setCreatedAt] = useState(initialCreatedAt);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze-ads", { method: "POST", body: JSON.stringify({ from, to }) });
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>Informe de pauta con IA</h3>
          <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", margin: "0.2rem 0 0" }}>
            {createdAt
              ? `Último informe: ${new Date(createdAt).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
              : "Analiza qué campañas/anuncios rindieron, fatiga de creativo y ROAS si cargaste ventas"}
          </p>
        </div>
        <button onClick={handleAnalyze} disabled={loading} className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>
          {loading ? "Analizando…" : summary ? "↻ Analizar de nuevo" : "✨ Analizar pauta"}
        </button>
      </div>
      {error && <p style={{ fontSize: "0.78rem", color: "var(--danger)", marginTop: "0.6rem" }}>{error}</p>}
      {summary && (
        <div className="prose" style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", lineHeight: 1.65, color: "var(--text-secondary)", marginTop: "1rem" }}>
          {summary}
        </div>
      )}
    </div>
  );
}
