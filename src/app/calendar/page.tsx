import { db } from "@/db/client";
import { createPost, deletePost } from "@/lib/posts/actions";

export const dynamic = "force-dynamic";

const MEDIA_TYPE_BADGE: Record<string, string> = {
  IMAGE: "badge-image",
  VIDEO: "badge-video",
  REELS: "badge-reel",
};
const MEDIA_TYPE_LABEL: Record<string, string> = {
  IMAGE: "Imagen",
  VIDEO: "Video",
  REELS: "Reel",
};
const STATUS_BADGE: Record<string, string> = {
  DRAFT: "badge-draft",
  SCHEDULED: "badge-scheduled",
  PUBLISHING: "badge-publishing",
  PUBLISHED: "badge-published",
  FAILED: "badge-failed",
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  SCHEDULED: "Programado",
  PUBLISHING: "Publicando…",
  PUBLISHED: "Publicado",
  FAILED: "Falló",
};

export default async function CalendarPage() {
  const [allPillars, allPosts] = await Promise.all([
    db.query.pillars.findMany({ orderBy: (p, { asc }) => [asc(p.id)] }),
    db.query.posts.findMany({ orderBy: (p, { asc }) => [asc(p.scheduledAt)] }),
  ]);

  const pillarLabel = (id: number) => allPillars.find((p) => p.id === id)?.label ?? "—";

  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">Calendario de contenido</h1>
        <p className="page-subtitle">Programá y gestioná tus posts de Instagram</p>
      </div>

      {/* New post form */}
      <div className="card" style={{ marginBottom: "1.75rem" }}>
        <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1.25rem", color: "var(--text)" }}>
          Nuevo post
        </h2>
        <form action={createPost} className="form-grid">
          <div className="form-row">
            <label>
              <span className="form-label">Pilar de contenido</span>
              <select name="pillarId" required className="form-input" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 0.75rem center", paddingRight: "2rem" }}>
                {allPillars.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>

            <label>
              <span className="form-label">Tipo de contenido</span>
              <select name="mediaType" required className="form-input" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 0.75rem center", paddingRight: "2rem" }}>
                <option value="IMAGE">Imagen</option>
                <option value="VIDEO">Video</option>
                <option value="REELS">Reel</option>
              </select>
            </label>
          </div>

          <label>
            <span className="form-label">Archivo (imagen o video desde tu computadora)</span>
            <input type="file" name="mediaFile" accept="image/*,video/*" required className="form-input" />
          </label>

          <label>
            <span className="form-label">Caption / texto del post</span>
            <textarea name="caption" required rows={4} className="form-input" placeholder="Escribí el texto que va a acompañar tu post…" style={{ resize: "vertical" }} />
          </label>

          <label>
            <span className="form-label">Fecha y hora de publicación</span>
            <input type="datetime-local" name="scheduledAt" required className="form-input" />
          </label>

          <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: "0.25rem" }}>
            Programar post
          </button>
        </form>
      </div>

      {/* Posts list */}
      <div>
        <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem", color: "var(--text)" }}>
          Posts ({allPosts.length})
        </h2>

        {allPosts.length === 0 ? (
          <div className="card">
            <div className="empty">
              <div className="empty-icon">📅</div>
              <p>Todavía no hay posts cargados.<br />Usá el formulario de arriba para agregar el primero.</p>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "0.625rem" }}>
            {allPosts.map((post) => (
              <div key={post.id} className="post-card">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="post-card-meta">
                    <span>
                      {new Date(post.scheduledAt).toLocaleString("es-AR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span style={{ color: "var(--border)" }}>·</span>
                    <span className={`badge ${MEDIA_TYPE_BADGE[post.mediaType]}`}>
                      {MEDIA_TYPE_LABEL[post.mediaType]}
                    </span>
                    <span style={{ color: "var(--border)" }}>·</span>
                    <span>{pillarLabel(post.pillarId)}</span>
                    {post.igPermalink && (
                      <>
                        <span style={{ color: "var(--border)" }}>·</span>
                        <a href={post.igPermalink} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontSize: "0.75rem" }}>
                          Ver en Instagram →
                        </a>
                      </>
                    )}
                  </div>
                  <p className="post-card-caption">{post.caption}</p>
                </div>
                <div className="post-card-actions">
                  <span className={`badge ${STATUS_BADGE[post.status]}`}>
                    {STATUS_LABEL[post.status]}
                  </span>
                  {post.status !== "PUBLISHED" && (
                    <form action={deletePost}>
                      <input type="hidden" name="id" value={post.id} />
                      <button type="submit" className="btn btn-ghost">Eliminar</button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
