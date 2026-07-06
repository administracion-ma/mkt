"use client";

import { useState } from "react";

type QA = { question: string; answer: string };

export function AnalysisPanel({
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

  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QA[]>([]);
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", { method: "POST", body: JSON.stringify({ from, to }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error al analizar");
      setSummary(body.summary);
      setCreatedAt(body.createdAt);
      setHistory([]); // informe nuevo: arrancamos la conversación de nuevo
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al analizar");
    } finally {
      setLoading(false);
    }
  }

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || askLoading) return;
    setAskLoading(true);
    setAskError(null);
    try {
      const res = await fetch("/api/analyze/ask", {
        method: "POST",
        body: JSON.stringify({ question: q, from, to, history, report: summary }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error al preguntar");
      setHistory((h) => [...h, { question: q, answer: body.answer }]);
      setQuestion("");
    } catch (err) {
      setAskError(err instanceof Error ? err.message : "Error al preguntar");
    } finally {
      setAskLoading(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>Informe con IA</h3>
          <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", margin: "0.2rem 0 0" }}>
            {createdAt
              ? `Último informe: ${new Date(createdAt).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
              : "Últimos 30 días · analiza qué funcionó y qué no"}
          </p>
        </div>
        <button onClick={handleAnalyze} disabled={loading} className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>
          {loading ? "Analizando…" : summary ? "↻ Analizar de nuevo" : "✨ Analizar"}
        </button>
      </div>
      {error && <p style={{ fontSize: "0.78rem", color: "var(--danger)", marginTop: "0.6rem" }}>{error}</p>}
      {summary && (
        <div className="prose" style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", lineHeight: 1.65, color: "var(--text-secondary)", marginTop: "1rem" }}>
          {summary}
        </div>
      )}

      {/* Preguntas — si hay informe, responde sobre ESE informe; si no, sobre los datos del período */}
      <div style={{ borderTop: "1px solid var(--border)", marginTop: "1.25rem", paddingTop: "1.1rem" }}>
        <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", margin: "0 0 0.7rem" }}>
          {summary
            ? "Preguntale algo puntual sobre este informe, o dale una devolución (\"no estoy de acuerdo con...\", \"profundizá en...\")"
            : "Preguntale algo puntual sobre el período. Ej: \"¿qué reel me trajo más seguidores?\""}
        </p>

        {history.length > 0 && (
          <div className="prose" style={{ display: "flex", flexDirection: "column", gap: "0.9rem", marginBottom: "1rem" }}>
            {history.map((qa, i) => (
              <div key={i}>
                <p style={{ margin: "0 0 0.3rem", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)" }}>
                  {qa.question}
                </p>
                <p style={{ margin: 0, fontSize: "0.82rem", lineHeight: 1.6, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                  {qa.answer}
                </p>
              </div>
            ))}
          </div>
        )}

        {askError && <p style={{ fontSize: "0.78rem", color: "var(--danger)", marginBottom: "0.6rem" }}>{askError}</p>}

        <form onSubmit={handleAsk} style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Escribí tu pregunta o devolución…"
            disabled={askLoading}
            className="form-input"
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={askLoading || !question.trim()} className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>
            {askLoading ? "Pensando…" : "Preguntar"}
          </button>
        </form>
      </div>
    </div>
  );
}
