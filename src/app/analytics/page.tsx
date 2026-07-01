import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { posts, postMetrics } from "@/db/schema";
import { getConnectedAccount } from "@/lib/instagram/account-store";
import { getAccountSummary } from "@/lib/instagram/graph-api";
import { PeriodFilter } from "@/components/PeriodFilter";

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
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtSec(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const s = ms / 1000;
  return s >= 60 ? `${Math.floor(s / 60)}m${Math.round(s % 60)}s` : `${s.toFixed(1)}s`;
}

function hookRate(plays: number | null | undefined, reach: number | null | undefined): string {
  if (!plays || !reach) return "—";
  return `${((plays / reach) * 100).toFixed(1)}%`;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
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

  const fromDate = from ? new Date(from + "T00:00:00") : undefined;
  const toDate = to ? new Date(to + "T23:59:59") : undefined;

  const [summary, publishedPosts, allMetrics] = await Promise.all([
    getAccountSummary(account.igUserId, account.accessToken).catch(() => null),
    db.query.posts.findMany({
      where: and(
        eq(posts.status, "PUBLISHED"),
        fromDate ? gte(posts.publishedAt, fromDate) : undefined,
        toDate ? lte(posts.publishedAt, toDate) : undefined,
      ),
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

  // Totals only for filtered posts
  const filteredMetrics = publishedPosts
    .map((p) => latestMetrics.get(p.id))
    .filter(Boolean) as typeof allMetrics;

  const hasMetrics = filteredMetrics.length > 0;
  const totalReach = filteredMetrics.reduce((s, m) => s + (m.reach ?? 0), 0);
  const totalImpressions = filteredMetrics.reduce((s, m) => s + (m.impressions ?? 0), 0);
  const totalLikes = filteredMetrics.reduce((s, m) => s + (m.likeCount ?? 0), 0);
  const totalSaved = filteredMetrics.reduce((s, m) => s + (m.savedCount ?? 0), 0);

  const periodLabel =
    from && to
      ? `${new Date(from).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })} → ${new Date(to).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}`
      : "Todo el tiempo";

  return (
    <main className="page">
      {/* Header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 className="page-title">Analítica</h1>
          <p className="page-subtitle">{periodLabel}</p>
        </div>
      </div>

      {/* Period filter */}
      <div style={{ marginBottom: "1.5rem" }}>
        <PeriodFilter />
      </div>

      {/* Account card */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>@{account.igUsername}</span>
              {tokenDaysLeft < 15 && (
                <span style={{ fontSize: "0.7rem", background: "rgba(239,68,68,0.1)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.25)", padding: "0.15rem 0.5rem", borderRadius: 5, fontWeight: 600 }}>
                  Token expira en {tokenDaysLeft}d
                </span>
              )}
            </div>
            <div style={{ color: "var(--text-secondary)", fontSize: "0.78rem", marginTop: "0.2rem" }}>
              Token válido por {tokenDaysLeft} días
              {tokenDaysLeft < 15 && (
                <> · <a href="/api/auth/instagram/start" style={{ color: "var(--accent)" }}>Renovar acceso</a></>
              )}
            </div>
          </div>
          {summary && (
            <div style={{ display: "flex", gap: "2.5rem" }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: "1.4rem", letterSpacing: "-0.03em" }}>
                  {summary.followersCount.toLocaleString()}
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Seguidores</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: "1.4rem", letterSpacing: "-0.03em" }}>
                  {summary.mediaCount}
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Posts totales</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Posts en período</div>
          <div className="stat-value">{publishedPosts.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Alcance total</div>
          <div className={`stat-value${hasMetrics && totalReach > 0 ? " accent" : ""}`}>
            {hasMetrics ? fmt(totalReach) : "—"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Impresiones</div>
          <div className="stat-value">{hasMetrics ? fmt(totalImpressions) : "—"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Likes · Guardados</div>
          <div className="stat-value">
            {hasMetrics ? `${fmt(totalLikes)} · ${fmt(totalSaved)}` : "—"}
          </div>
        </div>
      </div>

      {/* Posts table */}
      <div className="card">
        <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "1.25rem", color: "var(--text-secondary)" }}>
          {publishedPosts.length} post{publishedPosts.length !== 1 ? "s" : ""} · {periodLabel}
        </h2>

        {publishedPosts.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📊</div>
            <p>
              {from || to
                ? "No hay posts en el período seleccionado."
                : "No hay posts publicados todavía. Importá el historial de Instagram desde GitHub Actions."}
            </p>
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
                  <th style={{ textAlign: "right" }}>Views</th>
                  <th style={{ textAlign: "right" }}>Hook%</th>
                  <th style={{ textAlign: "right" }}>Avg Watch</th>
                  <th style={{ textAlign: "right" }}>Skip%</th>
                  <th style={{ textAlign: "right" }}>Likes</th>
                  <th style={{ textAlign: "right" }}>Coment.</th>
                  <th style={{ textAlign: "right" }}>Guard.</th>
                  <th style={{ textAlign: "right" }}>Shares</th>
                  <th style={{ textAlign: "right" }}>+Seg.</th>
                  <th style={{ textAlign: "right" }}>Visitas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {publishedPosts.map((post) => {
                  const m = latestMetrics.get(post.id);
                  const isReel = post.mediaType === "REELS";
                  return (
                    <tr key={post.id}>
                      <td className="muted" style={{ whiteSpace: "nowrap", fontSize: "0.775rem" }}>
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
                      <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                        {post.caption || <span style={{ color: "var(--text-tertiary)" }}>Sin caption</span>}
                      </td>
                      <td className="num" style={{ color: m?.reach ? "var(--accent)" : "var(--text-tertiary)", fontWeight: m?.reach ? 600 : 400 }}>
                        {fmt(m?.reach)}
                      </td>
                      <td className="num muted">{fmt(m?.plays)}</td>
                      <td className="num" style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                        {isReel ? hookRate(m?.plays, m?.reach) : "—"}
                      </td>
                      <td className="num muted" style={{ fontSize: "0.78rem" }}>
                        {isReel ? fmtSec(m?.avgWatchTimeMs) : "—"}
                      </td>
                      <td className="num muted" style={{ fontSize: "0.78rem" }}>
                        {isReel ? fmtPct(m?.skipRate) : "—"}
                      </td>
                      <td className="num muted">{fmt(m?.likeCount)}</td>
                      <td className="num muted">{fmt(m?.commentCount)}</td>
                      <td className="num muted">{fmt(m?.savedCount)}</td>
                      <td className="num muted">{fmt(m?.sharesCount)}</td>
                      <td className="num muted">{fmt(m?.followsCount)}</td>
                      <td className="num muted">{fmt(m?.profileVisits)}</td>
                      <td>
                        {post.igPermalink && (
                          <a href={post.igPermalink} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
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
