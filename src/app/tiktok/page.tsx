import { db } from "@/db/client";
import { getConnectedTiktokAccount } from "@/lib/tiktok/account-store";
import { TiktokVideoForm } from "@/components/TiktokVideoForm";
import { TiktokVideoList, type TiktokVideoRow } from "@/components/TiktokVideoList";
import { TiktokVideoGrid, type TiktokGridRow } from "@/components/TiktokVideoGrid";
import { StatDelta } from "@/components/StatDelta";
import { StatLabel } from "@/components/StatLabel";

export const dynamic = "force-dynamic";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default async function TiktokPage() {
  const account = await getConnectedTiktokAccount().catch(() => null);

  if (!account) {
    return (
      <main className="page">
        <div className="card">
          <div className="connect-cta">
            <div className="connect-cta-icon">🎵</div>
            <h2>Conectá tu cuenta de TikTok</h2>
            <p>Para programar videos y ver sus métricas, conectá la cuenta con tu cuenta de TikTok.</p>
            <a href="/api/auth/tiktok/start" className="btn btn-primary">Conectar con TikTok</a>
          </div>
        </div>
      </main>
    );
  }

  const [videos, allMetrics, pillars, accountSnapshots] = await Promise.all([
    db.query.tiktokVideos.findMany({ orderBy: (v, { desc }) => [desc(v.scheduledAt)] }),
    db.query.tiktokVideoMetrics.findMany({ orderBy: (m, { desc }) => [desc(m.capturedAt)] }),
    db.query.pillars.findMany(),
    db.query.tiktokAccountMetrics.findMany({ orderBy: (m, { desc }) => [desc(m.capturedAt)] }).catch(() => []),
  ]);

  const lastSnapshot = accountSnapshots[0] ?? null;
  const nowMs = new Date().getTime();
  const weekAgoSnapshot = accountSnapshots.find(
    (s) => nowMs - s.capturedAt.getTime() >= 5 * 24 * 60 * 60 * 1000
  ) ?? null;

  const pillarById = new Map(pillars.map((p) => [p.id, p.label]));
  const latestMetrics = new Map<number, (typeof allMetrics)[0]>();
  for (const m of allMetrics) {
    if (!latestMetrics.has(m.videoId)) latestMetrics.set(m.videoId, m);
  }

  const rows: TiktokVideoRow[] = videos.map((v) => ({
    id: v.id,
    title: v.title,
    status: v.status,
    scheduledAt: v.scheduledAt.toISOString(),
    publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
    tiktokUrl: v.tiktokUrl,
    publishError: v.publishError,
    pillarLabel: v.pillarId ? pillarById.get(v.pillarId) ?? null : null,
  }));

  const gridRows: TiktokGridRow[] = videos
    .filter((v) => v.status === "PUBLISHED")
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .map((v) => {
      const m = latestMetrics.get(v.id);
      return {
        id: v.id,
        title: v.title,
        publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
        tiktokUrl: v.tiktokUrl,
        coverImageUrl: v.coverImageUrl,
        pillarId: v.pillarId,
        pillarLabel: v.pillarId ? pillarById.get(v.pillarId) ?? null : null,
        views: m?.views ?? null,
        likes: m?.likes ?? null,
        comments: m?.comments ?? null,
        shares: m?.shares ?? null,
      };
    });

  const pendingRows = rows.filter((r) => r.status !== "PUBLISHED");
  const totalViews = gridRows.reduce((s, r) => s + (r.views ?? 0), 0);

  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">TikTok</h1>
        <p className="page-subtitle">Cuenta: {account.displayName}</p>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <div className="stat-card">
          <StatLabel label="Seguidores" info="Total de seguidores de la cuenta. El delta compara contra hace una semana." />
          <div className="stat-value accent">{fmt(lastSnapshot?.followerCount)}</div>
          <StatDelta curr={lastSnapshot?.followerCount} prev={weekAgoSnapshot?.followerCount} />
        </div>
        <div className="stat-card">
          <StatLabel label="Likes totales" info="Suma histórica de likes de todos los videos de la cuenta (dato de TikTok)." />
          <div className="stat-value">{fmt(lastSnapshot?.likesCount)}</div>
          <StatDelta curr={lastSnapshot?.likesCount} prev={weekAgoSnapshot?.likesCount} />
        </div>
        <div className="stat-card">
          <StatLabel label="Vistas (videos acá cargados)" info="Suma de vistas de los videos trackeados en esta app." />
          <div className="stat-value">{fmt(totalViews)}</div>
        </div>
        <div className="stat-card">
          <StatLabel label="Videos" info="Total de videos en la cuenta, según TikTok." />
          <div className="stat-value">{fmt(lastSnapshot?.videoCount)}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "1rem" }}>Programar video</h2>
        <TiktokVideoForm pillars={pillars.map((p) => ({ id: p.id, label: p.label }))} />
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text-secondary)" }}>
          {gridRows.length} video{gridRows.length !== 1 ? "s" : ""} publicado{gridRows.length !== 1 ? "s" : ""}
        </h2>
        <TiktokVideoGrid rows={gridRows} pillars={pillars.map((p) => ({ id: p.id, label: p.label }))} />
      </div>

      {pendingRows.length > 0 && (
        <div className="card">
          <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "1.25rem", color: "var(--text-secondary)" }}>
            {pendingRows.length} pendiente{pendingRows.length !== 1 ? "s" : ""} (programados / procesando / con error)
          </h2>
          <TiktokVideoList videos={pendingRows} />
        </div>
      )}
    </main>
  );
}
