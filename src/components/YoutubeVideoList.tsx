import { publishYoutubeVideoNow, deleteYoutubeVideo } from "@/lib/youtube/actions";

export type YoutubeVideoRow = {
  id: number;
  title: string;
  status: string;
  privacyStatus: string;
  scheduledAt: string;
  publishedAt: string | null;
  youtubeUrl: string | null;
  publishError: string | null;
  pillarLabel: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
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
  PUBLISHING: "Publicando",
  PUBLISHED: "Publicado",
  FAILED: "Error",
};

function fmt(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function YoutubeVideoList({ videos }: { videos: YoutubeVideoRow[] }) {
  if (videos.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">🎬</div>
        <p>Todavía no programaste ningún video.</p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            <th>Título</th>
            <th>Pilar</th>
            <th>Estado</th>
            <th>Fecha</th>
            <th className="num">Vistas</th>
            <th className="num">Likes</th>
            <th className="num">Comentarios</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {videos.map((v) => (
            <tr key={v.id}>
              <td>
                {v.youtubeUrl ? (
                  <a href={v.youtubeUrl} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                    {v.title}
                  </a>
                ) : (
                  v.title
                )}
                {v.publishError && (
                  <div style={{ fontSize: "0.7rem", color: "var(--danger)", marginTop: "0.2rem" }}>{v.publishError}</div>
                )}
              </td>
              <td className="muted">{v.pillarLabel ?? "—"}</td>
              <td>
                <span className={`badge ${STATUS_BADGE[v.status] ?? "badge-draft"}`}>{STATUS_LABEL[v.status] ?? v.status}</span>
              </td>
              <td className="muted">
                {new Date(v.publishedAt ?? v.scheduledAt).toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </td>
              <td className="num">{fmt(v.views)}</td>
              <td className="num">{fmt(v.likes)}</td>
              <td className="num">{fmt(v.comments)}</td>
              <td>
                <div style={{ display: "flex", gap: "0.3rem", justifyContent: "flex-end" }}>
                  {(v.status === "SCHEDULED" || v.status === "FAILED" || v.status === "DRAFT") && (
                    <form action={publishYoutubeVideoNow}>
                      <input type="hidden" name="id" value={v.id} />
                      <button type="submit" className="btn-ghost" style={{ fontSize: "0.7rem" }}>Publicar ahora</button>
                    </form>
                  )}
                  {v.status !== "PUBLISHING" && (
                    <form action={deleteYoutubeVideo}>
                      <input type="hidden" name="id" value={v.id} />
                      <button type="submit" className="btn-ghost" style={{ fontSize: "0.7rem" }}>Eliminar</button>
                    </form>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
