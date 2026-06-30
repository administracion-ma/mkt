import Link from "next/link";
import { db } from "@/db/client";
import { createPost, deletePost } from "@/lib/posts/actions";

export const dynamic = "force-dynamic";

const MEDIA_TYPE_LABELS: Record<string, string> = {
  IMAGE: "Imagen",
  VIDEO: "Video",
  REELS: "Reel",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  SCHEDULED: "Programado",
  PUBLISHING: "Publicando",
  PUBLISHED: "Publicado",
  FAILED: "Falló",
};

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "0.5rem",
  marginTop: "0.25rem",
  borderRadius: 6,
  border: "1px solid #ccc",
};

export default async function CalendarPage() {
  const [allPillars, allPosts] = await Promise.all([
    db.query.pillars.findMany({ orderBy: (p, { asc }) => [asc(p.id)] }),
    db.query.posts.findMany({ orderBy: (p, { asc }) => [asc(p.scheduledAt)] }),
  ]);

  const pillarLabel = (id: number) =>
    allPillars.find((p) => p.id === id)?.label ?? "—";

  return (
    <main
      style={{
        maxWidth: 880,
        margin: "3rem auto",
        fontFamily: "sans-serif",
        padding: "0 1rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h1>Calendario de contenido</h1>
        <Link href="/" style={{ color: "#1877F2" }}>
          ← Conexión Instagram
        </Link>
      </div>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: "1.5rem",
          marginBottom: "2rem",
        }}
      >
        <h2 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>Nuevo post</h2>
        <form action={createPost} style={{ display: "grid", gap: "0.75rem" }}>
          <label>
            Pilar
            <select name="pillarId" required style={inputStyle}>
              {allPillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Tipo de contenido
            <select name="mediaType" required style={inputStyle}>
              <option value="IMAGE">Imagen</option>
              <option value="VIDEO">Video</option>
              <option value="REELS">Reel</option>
            </select>
          </label>

          <label>
            Archivo (imagen o video, subido desde tu compu)
            <input
              type="file"
              name="mediaFile"
              accept="image/*,video/*"
              required
              style={inputStyle}
            />
          </label>

          <label>
            Texto / caption
            <textarea name="caption" required rows={4} style={inputStyle} />
          </label>

          <label>
            Fecha y hora de publicación
            <input type="datetime-local" name="scheduledAt" required style={inputStyle} />
          </label>

          <button
            type="submit"
            style={{
              padding: "0.75rem",
              background: "#1877F2",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Programar post
          </button>
        </form>
      </section>

      <section>
        <h2 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>
          Posts programados ({allPosts.length})
        </h2>
        {allPosts.length === 0 && <p>Todavía no hay posts cargados.</p>}
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {allPosts.map((post) => (
            <div
              key={post.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: "1rem",
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <div>
                <div style={{ fontWeight: "bold" }}>
                  {new Date(post.scheduledAt).toLocaleString("es-AR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {" · "}
                  {MEDIA_TYPE_LABELS[post.mediaType]}
                  {" · "}
                  {pillarLabel(post.pillarId)}
                </div>
                <p style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap" }}>
                  {post.caption}
                </p>
                <a
                  href={post.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#1877F2", fontSize: "0.9rem" }}
                >
                  Ver archivo
                </a>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: "0.5rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.85rem",
                    padding: "0.25rem 0.5rem",
                    borderRadius: 4,
                    background: "#eee",
                    whiteSpace: "nowrap",
                  }}
                >
                  {STATUS_LABELS[post.status]}
                </span>
                <form action={deletePost}>
                  <input type="hidden" name="id" value={post.id} />
                  <button
                    type="submit"
                    style={{
                      background: "none",
                      border: "none",
                      color: "#c00",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                    }}
                  >
                    Eliminar
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
