"use client";

import { useState, useTransition } from "react";
import { saveBrandProfile } from "@/lib/brand/actions";

export function BrandProfileForm({ initialContent }: { initialContent: string }) {
  const [content, setContent] = useState(initialContent);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    const formData = new FormData();
    formData.set("content", content);
    startTransition(async () => {
      try {
        await saveBrandProfile(formData);
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card">
      <label>
        <span className="form-label">Contale a la IA sobre el negocio</span>
        <textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setSaved(false);
          }}
          rows={16}
          className="form-input"
          style={{ resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }}
          placeholder="Qué vende Coinbox, quién es el público, qué tono usar, promociones activas…"
        />
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "1rem" }}>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Guardando…" : "Guardar"}
        </button>
        {saved && !pending && (
          <span style={{ color: "#22c55e", fontSize: "0.82rem", fontWeight: 600 }}>✓ Guardado</span>
        )}
        {error && <span style={{ color: "var(--danger)", fontSize: "0.82rem" }}>{error}</span>}
      </div>
    </form>
  );
}
