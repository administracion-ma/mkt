"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { createTiktokVideo } from "@/lib/tiktok/actions";

export function TiktokVideoForm({ pillars }: { pillars: { id: number; label: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("videoFile") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) {
      setResult({ ok: false, message: "Falta el archivo de video." });
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const blob = await upload(`tiktok/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/tiktok/blob-upload",
        onUploadProgress: (p) => setProgress(Math.round(p.percentage)),
      });

      const formData = new FormData(form);
      formData.delete("videoFile");
      formData.set("videoFileUrl", blob.url);

      startTransition(async () => {
        try {
          await createTiktokVideo(formData);
          setResult({ ok: true, message: "Video programado." });
          form.reset();
        } catch (err) {
          setResult({ ok: false, message: err instanceof Error ? err.message : "Error desconocido" });
        }
      });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Error al subir el archivo" });
    } finally {
      setUploading(false);
    }
  }

  const now = new Date();
  const defaultDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="form-grid">
      <label>
        <span className="form-label">Título / descripción</span>
        <input type="text" name="title" className="form-input" maxLength={150} placeholder="Opcional" />
      </label>
      <div className="form-row">
        <label>
          <span className="form-label">Pilar (opcional)</span>
          <select name="pillarId" className="form-input">
            <option value="">Sin asignar</option>
            {pillars.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="form-label">Fecha y hora</span>
          <input type="datetime-local" name="scheduledAt" className="form-input" defaultValue={defaultDateTime} required />
        </label>
      </div>
      <label>
        <span className="form-label">Archivo de video (vertical)</span>
        <input type="file" name="videoFile" accept="video/*" className="form-input" required />
      </label>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" disabled={uploading || pending} className="btn btn-primary">
          {uploading ? `Subiendo… ${progress}%` : pending ? "Guardando…" : "Programar"}
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
          <input type="checkbox" name="publishNow" value="1" />
          Publicar ahora (no esperar la fecha)
        </label>
      </div>
      <p style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", margin: 0 }}>
        Mientras la app de TikTok no esté auditada, todo lo que se publique acá sale como <strong>privado (solo vos lo ves)</strong> — es una restricción de TikTok, no nuestra.
      </p>
      {result && (
        <p style={{ fontSize: "0.78rem", color: result.ok ? "var(--success)" : "var(--danger)", margin: 0 }}>
          {result.ok ? "✓ " : "✕ "}{result.message}
        </p>
      )}
    </form>
  );
}
