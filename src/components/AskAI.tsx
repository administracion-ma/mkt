"use client";

import { useState } from "react";

type QA = { question: string; answer: string };

export function AskAI({ from, to }: { from?: string; to?: string }) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QA[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze/ask", {
        method: "POST",
        body: JSON.stringify({ question: q, from, to, history }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error al preguntar");
      setHistory((h) => [...h, { question: q, answer: body.answer }]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al preguntar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 0.2rem" }}>Preguntale a la IA</h3>
      <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", margin: "0 0 1rem" }}>
        Sobre el período seleccionado arriba. Ej: "¿qué reel me trajo más seguidores?", "¿conviene postear más carruseles?"
      </p>

      {history.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem", marginBottom: "1rem" }}>
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

      {error && <p style={{ fontSize: "0.78rem", color: "var(--danger)", marginBottom: "0.6rem" }}>{error}</p>}

      <form onSubmit={handleAsk} style={{ display: "flex", gap: "0.5rem" }}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Escribí tu pregunta…"
          disabled={loading}
          className="form-input"
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={loading || !question.trim()} className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>
          {loading ? "Pensando…" : "Preguntar"}
        </button>
      </form>
    </div>
  );
}
