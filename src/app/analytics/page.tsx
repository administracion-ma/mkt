import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { posts, postMetrics } from "@/db/schema";
import { getConnectedAccount } from "@/lib/instagram/account-store";
import { getAccountSummary } from "@/lib/instagram/graph-api";

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

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default async function AnalyticsPage() {
  const account = await getConnectedAccount();

  if (!account) {
    return (
      <main className="page">
        <div className="card">
          <div className="connect-cta">
            <div className="connect-cta-icon">📊</div>
            <h2>Conectá tu cuenta de Instagram</h2>
            <p>Para ver analíticas necesitás conectar tu cuenta de Instagram Business o Creator.</p>
            <a href="/api/auth/instagram/start" className="btn btn-primary">
              Conectar con Instagram
            </a>
          </div>
        </div>
      </main>
    );
  }

  const tokenDaysLeft = Math.ceil(
    (account.tokenExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const [summary, publishedPosts, allMetrics] = await Promise.all([
    getAccountSummary(account.igUserId, account.accessToken).catch(() => null),
    db.query.posts.findMany({
      where: eq(posts.status, "PUBLISHED"),
      orderBy: (p, { desc }) => [desc(p.publishedAt)],
    }),
    db.query.postMetrics.findMany({
      orderBy: (m, { desc }) => [desc(m.capturedAt)],
    }),
  ]);

  // Latest metrics snapshot per post
  const latestMetrics = new Map<number, typeof allMetrics[0]>();
  for (const m of allMetrics) {
    if (!latestMetrics.has(m.postId)) latestMetrics.set(m.postId, m);
  }

  const hasMetrics = latestMetrics.size > 0;
  const totalReach = Array.from(latestMetrics.values()).reduce((s, m) => s + (m.reach ?? 0), 0);
  const totalImpressions = Array.from(latestMetrics.values()).reduce((s, m) => s + (m.impressions ?? 0), 0);
  const totalLikes = Array.from(latestMetrics.values()).reduce((s, m) => s + (m.likeCount ?? 0), 0);

  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">Analítica</h1>
        <p className="page-subtitle">Rendimiento de tu cuenta de Instagram</p>
      </div>

      {/* Account card */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>@{account.igUsername}</span>
              {tokenDaysLeft < 15 && (
                <span style={{ fontSize: "0.72rem", background: "rgba(239,68,68,0.1)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.25)", padding: "0.15rem 0.5rem", borderRadius: 5, fontWeight: 600 }}>
                  Token expira en {tokenDaysLeft}d
                </span>
              )}
            </div>
            <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: "0.2rem" }}>
              Token válido por {tokenDaysLeft} días
              {tokenDaysLeft < 15 && (
                <> · <a href="/api/auth/instagram/start" style={{ color: "var(--accent)" }}>Renovar acceso</a></>
              )}
            </div>
          </div>
          {summary && (
            <div style={{ display: "flex", gap: "2.5rem" }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: "1.25rem" }}>{summary.followersCount.toLocaleString()}</div>
                <div style={{ color: "var(--text-secondary)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Seguidores</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: "1.25rem" }}>{summary.mediaCount}</div>
                <div style={{ color: "var(--text-secondary)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Posts totales</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Posts publicados</div>
          <div className="stat-value">{publishedPosts.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Alcance total</div>
          <div className={`stat-value${hasMetrics ? " accent" : ""}`}>
            {hasMetrics ? fmt(totalReach) : "—"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Impresiones totales</div>
          <div className="stat-value">{hasMetrics ? fmt(totalImpressions) : "—"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Likes totales</div>
          <div className="stat-value">{hasMetrics ? fmt(totalLikes) : "—"}</div>
        </div>
      </div>

      {/* Info banner if no metrics yet */}
      {!hasMetrics && publishedPosts.length > 0 && (
        <div className="alert-info">
          Las métricas se sincronizan automáticamente una vez por día. Los datos aparecerán aquí después del primer sync diario.
        </div>
      )}

      {/* Posts table */}
      <div className="card">
        <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1.25rem" }}>
          Posts publicados
        </h2>

        {publishedPosts.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📊</div>
            <p>Todavía no hay posts publicados. Los posts programados aparecerán aquí después de publicarse.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Caption</th>
                  <th style={{ textAlign: "right" }}>Alcance</th>
                  <th style={{ textAlign: "right" }}>Impr.</th>
                  <th style={{ textAlign: "right" }}>Likes</th>
                  <th style={{ textAlign: "right" }}>Coment.</th>
                  <th style={{ textAlign: "right" }}>Guard.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {publishedPosts.map((post) => {
                  const m = latestMetrics.get(post.id);
                  return (
                    <tr key={post.id}>
                      <td className="muted" style={{ whiteSpace: "nowrap", fontSize: "0.78rem" }}>
                        {post.publishedAt
                          ? new Date(post.publishedAt).toLocaleDateString("es-AR", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                      <td>
                        <span className={`badge ${MEDIA_TYPE_BADGE[post.mediaType]}`}>
                          {MEDIA_TYPE_LABEL[post.mediaType]}
                        </span>
                      </td>
                      <td style={{ maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                        {post.caption}
                      </td>
                      <td className="num" style={{ color: m?.reach ? "var(--accent)" : "var(--text-tertiary)" }}>
                        {fmt(m?.reach)}
                      </td>
                      <td className="num muted">{fmt(m?.impressions)}</td>
                      <td className="num muted">{fmt(m?.likeCount)}</td>
                      <td className="num muted">{fmt(m?.commentCount)}</td>
                      <td className="num muted">{fmt(m?.savedCount)}</td>
                      <td>
                        {post.igPermalink && (
                          <a
                            href={post.igPermalink}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "var(--accent)", fontSize: "0.78rem", whiteSpace: "nowrap" }}
                          >
                            Ver →
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
