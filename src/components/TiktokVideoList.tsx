import { publishTiktokVideoNow, deleteTiktokVideo } from "@/lib/tiktok/actions";

export type TiktokVideoRow = {
  id: number;
  title: string;
  status: string;
  scheduledAt: string;
  publishedAt: string | null;
  tiktokUrl: string | null;
  publishError: string | null;
  pillarLabel: string | null;
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
  PUBLISHING: "Procesando en TikTok",
  PUBLISHED: "Publicado",
  FAILED: "Error",
};

export function TiktokVideoList({ videos }: { videos: TiktokVideoRow[] }) {
  if (videos.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">🎵</div>
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
            <th></th>
          </tr>
        </thead>
        <tbody>
          {videos.map((v) => (
            <tr key={v.id}>
              <td>
                {v.tiktokUrl ? (
                  <a href={v.tiktokUrl} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                    {v.title || "(sin título)"}
                  </a>
                ) : (
                  v.title || "(sin título)"
                )}
                {v.publishError && (
                  <div style={{ fontSize: "0.7rem", color: "var(--danger)", marginTop: "0.2rem" }}>{v.publishError}</div>
                )}
                {v.status === "PUBLISHING" && (
                  <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", marginTop: "0.2rem" }}>
                    TikTok procesa el video en segundo plano — se resuelve solo en el próximo sync.
                  </div>
                )}
              </td>
              <td className="muted">{v.pillarLabel ?? "—"}</td>
              <td>
                <span className={`badge ${STATUS_BADGE[v.status] ?? "badge-draft"}`}>{STATUS_LABEL[v.status] ?? v.status}</span>
              </td>
              <td className="muted">
                {new Date(v.publishedAt ?? v.scheduledAt).toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </td>
              <td>
                <div style={{ display: "flex", gap: "0.3rem", justifyContent: "flex-end" }}>
                  {(v.status === "SCHEDULED" || v.status === "FAILED" || v.status === "DRAFT") && (
                    <form action={publishTiktokVideoNow}>
                      <input type="hidden" name="id" value={v.id} />
                      <button type="submit" className="btn-ghost" style={{ fontSize: "0.7rem" }}>Publicar ahora</button>
                    </form>
                  )}
                  {v.status !== "PUBLISHING" && (
                    <form action={deleteTiktokVideo}>
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
