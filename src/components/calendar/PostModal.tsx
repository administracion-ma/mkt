"use client";

import { useState, useTransition } from "react";
import type { CalendarPost, Editor, Pillar } from "./types";
import {
  CHANNEL_LABEL,
  FORMAT_LABEL,
  MEDIA_TYPE_ICON,
  PRODUCTION_STATUS_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  pillarColor,
} from "./types";

const selectStyle: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.75rem center",
  paddingRight: "2rem",
};

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16,
          width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", padding: "1.5rem",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Ver / editar post existente ───────────────────────────────────────────────
export function PostDetailModal({
  post, pillars, editors, onClose, deletePost, publishPostNow,
}: {
  post: CalendarPost;
  pillars: Pillar[];
  editors: Editor[];
  onClose: () => void;
  deletePost: (formData: FormData) => Promise<void>;
  publishPostNow: (formData: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const pillar = pillars.find((p) => p.id === post.pillarId);
  const editor = editors.find((e) => e.id === post.editorId);
  const color = pillarColor(post.pillarId, pillars);
  const isVideo = post.mediaType === "REELS" || post.mediaType === "VIDEO";

  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", gap: "1rem" }}>
        <div style={{ width: 100, minWidth: 100, height: 136, borderRadius: 10, overflow: "hidden", background: "#111" }}>
          {isVideo ? (
            <video src={post.mediaUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline preload="metadata" />
          ) : (
            <img src={post.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
            <span style={{ fontSize: "0.65rem", fontWeight: 700, color, background: `${color}22`, padding: "0.15rem 0.5rem", borderRadius: 20 }}>
              {pillar?.label ?? "—"}
            </span>
            <span style={{ fontSize: "0.65rem", fontWeight: 700, color: STATUS_COLOR[post.status], background: `${STATUS_COLOR[post.status]}1e`, padding: "0.15rem 0.5rem", borderRadius: 20 }}>
              {STATUS_LABEL[post.status]}
            </span>
          </div>
          <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", margin: "0 0 0.3rem" }}>
            {MEDIA_TYPE_ICON[post.mediaType]} {new Date(post.scheduledAt).toLocaleString("es-AR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
          <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0, maxHeight: 90, overflowY: "auto" }}>
            {post.caption}
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", marginTop: "1rem", fontSize: "0.75rem" }}>
        {post.productionStatus && (
          <div><span style={{ color: "var(--text-tertiary)" }}>Producción: </span>{PRODUCTION_STATUS_LABEL[post.productionStatus]}</div>
        )}
        {post.channel && (
          <div><span style={{ color: "var(--text-tertiary)" }}>Canal: </span>{CHANNEL_LABEL[post.channel]}</div>
        )}
        {post.format && (
          <div><span style={{ color: "var(--text-tertiary)" }}>Formato: </span>{FORMAT_LABEL[post.format]}</div>
        )}
        {editor && (
          <div><span style={{ color: "var(--text-tertiary)" }}>Editor: </span>{editor.label}</div>
        )}
        {post.rawFootageUrl && (
          <div style={{ gridColumn: "span 2" }}>
            <a href={post.rawFootageUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Material crudo →</a>
          </div>
        )}
        {post.igPermalink && (
          <div style={{ gridColumn: "span 2" }}>
            <a href={post.igPermalink} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Ver en Instagram →</a>
          </div>
        )}
      </div>

      {post.status === "FAILED" && (
        <p style={{ fontSize: "0.72rem", color: "var(--danger)", marginTop: "0.75rem" }}>
          La publicación falló. Podés reintentar publicarla ahora.
        </p>
      )}

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
        {(post.status === "SCHEDULED" || post.status === "FAILED") && (
          <form action={publishPostNow} onSubmit={() => startTransition(() => {})}>
            <input type="hidden" name="id" value={post.id} />
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? "Publicando…" : "Publicar ahora"}
            </button>
          </form>
        )}
        {post.status !== "PUBLISHED" && (
          <form action={deletePost}>
            <input type="hidden" name="id" value={post.id} />
            <button type="submit" className="btn btn-ghost">Eliminar</button>
          </form>
        )}
        <button type="button" onClick={onClose} className="btn btn-secondary" style={{ marginLeft: "auto" }}>
          Cerrar
        </button>
      </div>
    </Overlay>
  );
}

// ── Crear post nuevo ──────────────────────────────────────────────────────────
export function NewPostModal({
  defaultDate, pillars, editors, onClose, createPost,
}: {
  defaultDate: string | null;
  pillars: Pillar[];
  editors: Editor[];
  onClose: () => void;
  createPost: (formData: FormData) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState<"schedule" | "now" | null>(null);
  const defaultDateTime = defaultDate ? `${defaultDate}T12:00` : "";

  return (
    <Overlay onClose={onClose}>
      <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 1rem" }}>Nuevo post</h3>
      <form
        action={createPost}
        onSubmit={() => {
          onClose();
        }}
        className="form-grid"
      >
        <div className="form-row">
          <label>
            <span className="form-label">Pilar de contenido</span>
            <select name="pillarId" required className="form-input" style={selectStyle}>
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="form-label">Tipo de contenido</span>
            <select name="mediaType" required className="form-input" style={selectStyle}>
              <option value="REELS">Reel</option>
              <option value="VIDEO">Video</option>
              <option value="IMAGE">Imagen</option>
            </select>
          </label>
        </div>

        <label>
          <span className="form-label">Archivo (imagen o video)</span>
          <input type="file" name="mediaFile" accept="image/*,video/*" required className="form-input" />
        </label>

        <label>
          <span className="form-label">Caption</span>
          <textarea name="caption" required rows={3} className="form-input" placeholder="Texto que acompaña el post…" style={{ resize: "vertical" }} />
        </label>

        <label>
          <span className="form-label">Fecha y hora</span>
          <input type="datetime-local" name="scheduledAt" required defaultValue={defaultDateTime} className="form-input" />
        </label>

        <div className="form-row">
          <label>
            <span className="form-label">Estado de producción</span>
            <select name="productionStatus" className="form-input" style={selectStyle} defaultValue="">
              <option value="">—</option>
              <option value="SIN_INICIAR">Sin iniciar</option>
              <option value="SIN_GRABAR">Sin grabar</option>
              <option value="PROCESO">En proceso</option>
              <option value="EDITADO">Editado</option>
              <option value="A_REVISAR">A revisar</option>
              <option value="SUBIDO">Subido</option>
            </select>
          </label>
          <label>
            <span className="form-label">Editor asignado</span>
            <select name="editorId" className="form-input" style={selectStyle} defaultValue="">
              <option value="">—</option>
              {editors.map((e) => (
                <option key={e.id} value={e.id}>{e.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-row">
          <label>
            <span className="form-label">Canal</span>
            <select name="channel" className="form-input" style={selectStyle} defaultValue="">
              <option value="">—</option>
              <option value="SOLO_TIKTOK">Solo TikTok</option>
              <option value="VERTICAL">Vertical</option>
              <option value="YOUTUBE">YouTube</option>
              <option value="PAUTA">Pauta</option>
              <option value="TODOS">Todos</option>
            </select>
          </label>
          <label>
            <span className="form-label">Formato</span>
            <select name="format" className="form-input" style={selectStyle} defaultValue="">
              <option value="">—</option>
              <option value="VERTICAL">Vertical</option>
              <option value="HORIZONTAL">Horizontal</option>
            </select>
          </label>
        </div>

        <label>
          <span className="form-label">Link de material crudo (opcional)</span>
          <input type="url" name="rawFootageUrl" className="form-input" placeholder="https://next.frame.io/…" />
        </label>

        <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.4rem" }}>
          <button
            type="submit"
            name="publishNow"
            value=""
            onClick={() => setSubmitting("schedule")}
            className="btn btn-primary"
            style={{ flex: 1 }}
          >
            {submitting === "schedule" ? "Programando…" : "Programar"}
          </button>
          <button
            type="submit"
            name="publishNow"
            value="1"
            onClick={() => setSubmitting("now")}
            className="btn btn-secondary"
            style={{ flex: 1 }}
          >
            {submitting === "now" ? "Publicando…" : "Publicar ahora"}
          </button>
        </div>
      </form>
    </Overlay>
  );
}
