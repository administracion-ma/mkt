import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, runLimited } from "@/db/client";
import { posts, accountMetrics, postMetrics } from "@/db/schema";
import { weeklyReach, bestTimeHeatmap, hookRanking, pillarPerformance, hashtagUsageSummary } from "@/lib/insights";
import { WeeklyReachChart, FollowersChart, BestTimeHeatmap, HookDiagnosis, PillarLeaderboard, HashtagPerformance } from "@/components/InsightsPanels";
import { getConnectedAccount } from "@/lib/instagram/account-store";
import { getAccountSummary } from "@/lib/instagram/graph-api";
import { PeriodFilter } from "@/components/PeriodFilter";
import type { PostCardRow } from "@/components/PostCards";
import { PostsView } from "@/components/PostsView";
import { SyncButton } from "@/components/SyncButton";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { KeyInsights } from "@/components/KeyInsights";
import { buildKeyInsights } from "@/lib/key-insights";
import { StatDelta } from "@/components/StatDelta";
import { StatLabel } from "@/components/StatLabel";
import { getAnalyticsRows } from "@/lib/analytics-data";

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

  const now = new Date();
  const tokenDaysLeft = Math.ceil(
    (account.tokenExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  const fromDate = from ? new Date(from + "T00:00:00") : undefined;
  const toDate = to ? new Date(to + "T23:59:59") : undefined;

  const summary = await getAccountSummary(account.igUserId, account.accessToken).catch(() => null);

  const [publishedPosts, accountHistory, allPillars, allCaptions, lastMetricEver] = await runLimited([
    () =>
      db.query.posts.findMany({
        where: and(
          eq(posts.status, "PUBLISHED"),
          fromDate ? gte(posts.publishedAt, fromDate) : undefined,
          toDate ? lte(posts.publishedAt, toDate) : undefined,
        ),
        orderBy: (p, { desc: d }) => [d(p.publishedAt)],
      }),
    // .catch: la tabla se crea con la migración; hasta entonces el panel muestra placeholder
    () =>
      db.query.accountMetrics
        .findMany({
          where: and(
            fromDate ? gte(accountMetrics.capturedAt, fromDate) : undefined,
            toDate ? lte(accountMetrics.capturedAt, toDate) : undefined,
          ),
          orderBy: (a, { asc }) => [asc(a.capturedAt)],
        })
        .catch(() => []),
    () => db.query.pillars.findMany(),
    // Todo el historial (sin filtro de período) — para saber desde cuándo no se usan
    // hashtags, aunque el período elegido no alcance a mostrar el último uso real.
    () =>
      db.query.posts.findMany({
        where: eq(posts.status, "PUBLISHED"),
        columns: { caption: true, publishedAt: true },
        orderBy: (p, { desc: d }) => [d(p.publishedAt)],
      }),
    // Última sincronización global (para el "actualizado hace X" del header),
    // independiente del rango filtrado — una sola fila, siempre rápida.
    () => db.query.postMetrics.findFirst({ orderBy: (m, { desc: d }) => [d(m.capturedAt)] }),
  ] as const);

  // Antes se leía la tabla ENTERA de métricas (todas las filas históricas de
  // todos los posts, sin filtro) y se armaba el mapa en memoria — con la data
  // creciendo eso escaneaba y transfería de más en cada carga de la página.
  // Ahora, con DISTINCT ON, la base devuelve directamente una fila por post
  // (la última), apoyada en el índice (post_id, captured_at DESC).
  const allMetrics =
    publishedPosts.length > 0
      ? await db
          .selectDistinctOn([postMetrics.postId])
          .from(postMetrics)
          .where(inArray(postMetrics.postId, publishedPosts.map((p) => p.id)))
          .orderBy(postMetrics.postId, desc(postMetrics.capturedAt))
      : [];

  // Resolvemos el mismo período default que usa /api/analyze (últimos 30 días si no hay filtro)
  // para poder comparar contra periodFrom/periodTo del informe guardado.
  const resolvedTo = toDate ?? new Date();
  const resolvedFrom = fromDate ?? new Date(resolvedTo.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Ventana anterior del mismo largo, para los deltas de las stat cards.
  const prevWindowFrom = new Date(resolvedFrom.getTime() - (resolvedTo.getTime() - resolvedFrom.getTime()));
  const prevRows = await getAnalyticsRows(prevWindowFrom, resolvedFrom);

  const lastReportAny = await db.query.analysisReports
    .findFirst({ orderBy: (r, { desc }) => [desc(r.createdAt)] })
    .catch(() => null);

  // Solo lo mostramos si es del mismo período que se está viendo ahora —
  // si no, es de otro filtro (7 días vs 30 días, etc.) y mostrarlo confunde.
  const sameDay = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
  const lastReport =
    lastReportAny &&
    sameDay(lastReportAny.periodFrom, resolvedFrom) &&
    sameDay(lastReportAny.periodTo, resolvedTo)
      ? lastReportAny
      : null;

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
      pillarId: p.pillarId ?? null,
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

  // Mejor post por ER%, pero solo entre posts con alcance relevante
  // (un ER alto con 200 de alcance no es tu mejor post)
  const minReachForBest = avgReach ? Math.max(300, avgReach * 0.3) : 300;
  const bestCandidates = withMetrics.filter((r) => (r.reach ?? 0) >= minReachForBest);
  const bestPost = bestCandidates.length > 0
    ? bestCandidates.reduce((best, r) => {
        if (!r.reach) return best;
        const erR = ((r.likeCount ?? 0) + (r.commentCount ?? 0) + (r.savedCount ?? 0) + (r.sharesCount ?? 0)) / r.reach;
        const erB = best.reach ? ((best.likeCount ?? 0) + (best.commentCount ?? 0) + (best.savedCount ?? 0) + (best.sharesCount ?? 0)) / best.reach : 0;
        return erR > erB ? r : best;
      })
    : null;

  // Agregados del período anterior — para los deltas de las stat cards.
  const prevWith = prevRows.filter((r) => r.reach != null && r.reach > 0);
  const prevAvgReach = prevWith.length > 0 ? Math.round(prevWith.reduce((s, r) => s + (r.reach ?? 0), 0) / prevWith.length) : null;
  const prevErValues = prevWith
    .map((r) => {
      if (!r.reach) return null;
      return ((r.likeCount ?? 0) + (r.commentCount ?? 0) + (r.savedCount ?? 0) + (r.sharesCount ?? 0)) / r.reach;
    })
    .filter((v): v is number => v != null);
  const prevAvgER = prevErValues.length > 0 ? prevErValues.reduce((s, v) => s + v, 0) / prevErValues.length : null;
  const prevSavedShares = prevWith.reduce((s, r) => s + (r.savedCount ?? 0) + (r.sharesCount ?? 0), 0);

  // Última sincronización global — no depende del rango filtrado.
  const lastSyncAt = lastMetricEver?.capturedAt?.toISOString() ?? null;

  // Insights agregados
  // Cantidad de semanas del gráfico según el período elegido (4 mín., 12 tope) —
  // si filtrás a "última semana" no tiene sentido mostrar 12 semanas de contexto vacío.
  const periodDays = Math.max(1, Math.round((resolvedTo.getTime() - resolvedFrom.getTime()) / (1000 * 60 * 60 * 24)));
  const weeksToShow = Math.min(12, Math.max(4, Math.ceil(periodDays / 7)));
  const weekPoints = weeklyReach(rows, weeksToShow, resolvedTo);
  const heatmap = bestTimeHeatmap(rows);
  const hooks = hookRanking(rows);
  const pillarStats = pillarPerformance(rows, allPillars);
  const hashtagUsage = hashtagUsageSummary(
    rows,
    allCaptions.map((p) => ({ caption: p.caption ?? null, publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null }))
  );
  const followerPoints = accountHistory
    .filter((a) => a.followersCount != null)
    .map((a) => ({ date: a.capturedAt.toISOString(), followers: a.followersCount! }));

  const keyInsights = buildKeyInsights({
    pillarStats,
    hashtagStats: hashtagUsage.stats,
    heatmapBest: heatmap.best,
    hookMedianSkip: hooks.medianSkip,
    hookWorst: hooks.worst,
    weekPoints,
  });

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
        <SyncButton lastSyncAt={lastSyncAt} />
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <PeriodFilter />
      </div>

      <KeyInsights insights={keyInsights} />

      <AnalysisPanel
        key={`${from ?? "default"}-${to ?? "default"}`}
        initialSummary={lastReport?.summary ?? null}
        initialCreatedAt={lastReport?.createdAt ? lastReport.createdAt.toISOString() : null}
        from={from}
        to={to}
      />

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
          <StatLabel label="Posts en período" info="Publicaciones que salieron en el período elegido. La constancia pesa tanto como la calidad para el algoritmo." />
          <div className="stat-value">{publishedPosts.length}</div>
          <StatDelta curr={publishedPosts.length} prev={prevRows.length > 0 ? prevRows.length : null} />
        </div>
        <div className="stat-card">
          <StatLabel label="Alcance promedio" info="Personas únicas promedio que vio cada post. La métrica base de distribución." />
          <div className={`stat-value${avgReach ? " accent" : ""}`}>
            {fmt(avgReach)}
          </div>
          <StatDelta curr={avgReach} prev={prevAvgReach} />
        </div>
        <div className="stat-card">
          <StatLabel label="ER% promedio" info="Engagement rate: interacciones sobre alcance. Sano: 3-6%. Mide si el contenido conecta, no solo si se ve." />
          <div className={`stat-value${avgER != null && avgER >= 0.05 ? " accent" : ""}`}>
            {avgER != null ? `${(avgER * 100).toFixed(2)}%` : "—"}
          </div>
          <StatDelta curr={avgER} prev={prevAvgER} />
        </div>
        <div className="stat-card">
          <StatLabel label="Guardados · Shares" info="Las 2 señales que más premia el algoritmo de Instagram en 2026 — valen más que los likes." />
          <div className="stat-value">
            {hasMetrics ? `${fmt(totalSaved)} · ${fmt(totalShares)}` : "—"}
          </div>
          <StatDelta curr={hasMetrics ? totalSaved + totalShares : null} prev={prevSavedShares > 0 ? prevSavedShares : null} />
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

      {/* Insights: tendencias — necesitan más ancho para leerse bien */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))", gap: "1rem", marginTop: "1.5rem" }}>
        <WeeklyReachChart points={weekPoints} />
        <FollowersChart points={followerPoints} periodFrom={resolvedFrom} />
      </div>

      {/* Insights: diagnóstico y rankings */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem", margin: "1rem 0 1.5rem" }}>
        <BestTimeHeatmap cells={heatmap.cells} best={heatmap.best} />
        <HookDiagnosis best={hooks.best} worst={hooks.worst} medianSkip={hooks.medianSkip} />
        <PillarLeaderboard stats={pillarStats} />
        <HashtagPerformance stats={hashtagUsage.stats} anyInPeriod={hashtagUsage.anyInPeriod} lastUsedAt={hashtagUsage.lastUsedAt} periodTo={resolvedTo} />
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
          <PostsView rows={rows} />
        )}
      </div>
    </main>
  );
}
