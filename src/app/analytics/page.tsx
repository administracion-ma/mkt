import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { posts, postMetrics } from "@/db/schema";
import { getConnectedAccount } from "@/lib/instagram/account-store";
import { getAccountSummary } from "@/lib/instagram/graph-api";
import { PeriodFilter } from "@/components/PeriodFilter";
import { PostCards, type PostCardRow } from "@/components/PostCards";

export const dynamic = "force-dynamic";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
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

  // Build rows for the cards (serializable for client component)
  const rows: PostCardRow[] = publishedPosts.map((p) => {
    const m = latestMetrics.get(p.id);
    return {
      id: p.id,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
      mediaType: p.mediaType,
      caption: p.caption ?? null,
      igPermalink: p.igPermalink ?? null,
      mediaUrl: p.mediaUrl ?? null,
      videoDurationMs: p.videoDurationMs ?? null,
      reach: m?.reach ?? null,
      plays: m?.plays ?? null,
      likeCount: m?.likeCount ?? null,
      commentCount: m?.commentCount ?? null,
      savedCount: m?.savedCount ?? null,
      sharesCount: m?.sharesCount ?? null,
      repostsCount: m?.repostsCount ?? null,
      avgWatchTimeMs: m?.avgWatchTimeMs ?? null,
      skipRate: m?.skipRate ?? null,
      followsCount: m?.followsCount ?? null,
      profileVisits: m?.profileVisits ?? null,
      followersReach: m?.followersReach ?? null,
      nonFollowersReach: m?.nonFollowersReach ?? null,
    };
  });

  // Summary stats
  const withMetrics = rows.filter((r) => r.reach != null && r.reach > 0);
  const hasMetrics = withMetrics.length > 0;

  const totalReach = withMetrics.reduce((s, r) => s + (r.reach ?? 0), 0);
  const avgReach = hasMetrics ? Math.round(totalReach / withMetrics.length) : null;

  const erValues = withMetrics
    .map((r) => {
      if (!r.reach) return null;
      const interactions = (r.likeCount ?? 0) + (r.commentCount ?? 0) + (r.savedCount ?? 0) + (r.sharesCount ?? 0);
      return interactions / r.reach;
    })
    .filter((v): v is number => v !== null);
  const avgER = erValues.length > 0 ? erValues.reduce((s, v) => s + v, 0) / erValues.length : null;

  const totalShares = withMetrics.reduce((s, r) => s + (r.sharesCount ?? 0), 0);
  const totalSaved = withMetrics.reduce((s, r) => s + (r.savedCount ?? 0), 0);

  const bestPost = withMetrics.length > 0
    ? withMetrics.reduce((best, r) => {
        if (!r.reach) return best;
        const erR = ((r.likeCount ?? 0) + (r.commentCount ?? 0) + (r.savedCount ?? 0) + (r.sharesCount ?? 0)) / r.reach;
        const erB = best.reach ? ((best.likeCount ?? 0) + (best.commentCount ?? 0) + (best.savedCount ?? 0) + (best.sharesCount ?? 0)) / best.reach : 0;
        return erR > erB ? r : best;
      })
    : null;

  const periodLabel =
    from && to
      ? `${new Date(from).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })} → ${new Date(to).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}`
      : "Todo el tiempo";

  return (
    <main className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 className="page-title">Analítica</h1>
          <p className="page-subtitle">{periodLabel}</p>
        </div>
      </div>

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
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div className="stat-card">
          <div className="stat-label">Posts en período</div>
          <div className="stat-value">{publishedPosts.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Alcance promedio</div>
          <div className={`stat-value${avgReach ? " accent" : ""}`}>
            {fmt(avgReach)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">ER% promedio</div>
          <div className={`stat-value${avgER != null && avgER >= 0.05 ? " accent" : ""}`}>
            {avgER != null ? `${(avgER * 100).toFixed(2)}%` : "—"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Guardados · Shares</div>
          <div className="stat-value">
            {hasMetrics ? `${fmt(totalSaved)} · ${fmt(totalShares)}` : "—"}
          </div>
        </div>
        {bestPost && bestPost.reach && (
          <div className="stat-card" style={{ gridColumn: "span 1" }}>
            <div className="stat-label">Mejor post (ER%)</div>
            <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--accent)", marginBottom: "0.15rem" }}>
              {(() => {
                const interactions = (bestPost.likeCount ?? 0) + (bestPost.commentCount ?? 0) + (bestPost.savedCount ?? 0) + (bestPost.sharesCount ?? 0);
                return `${((interactions / bestPost.reach!) * 100).toFixed(1)}%`;
              })()}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
              {bestPost.caption?.slice(0, 60) ?? "Sin caption"}
            </div>
          </div>
        )}
      </div>

      {/* Posts cards */}
      <div className="card">
        <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "1.25rem", color: "var(--text-secondary)" }}>
          {publishedPosts.length} post{publishedPosts.length !== 1 ? "s" : ""} · {periodLabel}
        </h2>

        {rows.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📊</div>
            <p>
              {from || to
                ? "No hay posts en el período seleccionado."
                : "No hay posts publicados todavía."}
            </p>
          </div>
        ) : (
          <PostCards rows={rows} />
        )}
      </div>
    </main>
  );
}
