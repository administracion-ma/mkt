import { db } from "@/db/client";
import { getConnectedYoutubeAccount } from "@/lib/youtube/account-store";
import { YoutubeVideoForm } from "@/components/YoutubeVideoForm";
import { YoutubeVideoList, type YoutubeVideoRow } from "@/components/YoutubeVideoList";
import { YoutubeVideoGrid, type YoutubeGridRow } from "@/components/YoutubeVideoGrid";

export const dynamic = "force-dynamic";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default async function YoutubePage() {
  const account = await getConnectedYoutubeAccount().catch(() => null);

  if (!account) {
    return (
      <main className="page">
        <div className="card">
          <div className="connect-cta">
            <div className="connect-cta-icon">▶️</div>
            <h2>Conectá tu canal de YouTube</h2>
            <p>Para programar videos y ver sus métricas, conectá el canal con tu cuenta de Google.</p>
            <a href="/api/auth/youtube/start" className="btn btn-primary">Conectar con YouTube</a>
          </div>
        </div>
      </main>
    );
  }

  const [videos, allMetrics, pillars, lastChannelSnapshot] = await Promise.all([
    db.query.youtubeVideos.findMany({ orderBy: (v, { desc }) => [desc(v.scheduledAt)] }),
    db.query.youtubeVideoMetrics.findMany({ orderBy: (m, { desc }) => [desc(m.capturedAt)] }),
    db.query.pillars.findMany(),
    db.query.youtubeChannelMetrics.findFirst({ orderBy: (m, { desc }) => [desc(m.capturedAt)] }).catch(() => null),
  ]);

  const pillarById = new Map(pillars.map((p) => [p.id, p.label]));
  const latestMetrics = new Map<number, (typeof allMetrics)[0]>();
  for (const m of allMetrics) {
    if (!latestMetrics.has(m.videoId)) latestMetrics.set(m.videoId, m);
  }

  const rows: YoutubeVideoRow[] = videos.map((v) => {
    const m = latestMetrics.get(v.id);
    return {
      id: v.id,
      title: v.title,
      status: v.status,
      privacyStatus: v.privacyStatus,
      scheduledAt: v.scheduledAt.toISOString(),
      publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
      youtubeUrl: v.youtubeUrl,
      publishError: v.publishError,
      pillarLabel: v.pillarId ? pillarById.get(v.pillarId) ?? null : null,
      views: m?.views ?? null,
      likes: m?.likes ?? null,
      comments: m?.comments ?? null,
    };
  });

  const totalViews = rows.reduce((s, r) => s + (r.views ?? 0), 0);
  const publishedCount = rows.filter((r) => r.status === "PUBLISHED").length;
  const scheduledCount = rows.filter((r) => r.status === "SCHEDULED").length;

  // Publicados → grilla con portada y semáforo; el resto (programados,
  // borradores, fallidos) sigue en la tabla de gestión de abajo.
  const gridRows: YoutubeGridRow[] = videos
    .filter((v) => v.status === "PUBLISHED" && v.youtubeVideoId)
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .map((v) => {
      const m = latestMetrics.get(v.id);
      return {
        id: v.id,
        youtubeVideoId: v.youtubeVideoId!,
        title: v.title,
        publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
        youtubeUrl: v.youtubeUrl,
        pillarLabel: v.pillarId ? pillarById.get(v.pillarId) ?? null : null,
        views: m?.views ?? null,
        likes: m?.likes ?? null,
        comments: m?.comments ?? null,
        averageViewPercentage: m?.averageViewPercentage ?? null,
        subscribersGained: m?.subscribersGained ?? null,
      };
    });

  const pendingRows = rows.filter((r) => r.status !== "PUBLISHED");

  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">YouTube</h1>
        <p className="page-subtitle">Canal: {account.channelTitle}</p>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <div className="stat-card">
          <div className="stat-label">Suscriptores</div>
          <div className="stat-value accent">{fmt(lastChannelSnapshot?.subscriberCount)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Vistas totales (canal)</div>
          <div className="stat-value">{fmt(lastChannelSnapshot?.viewCount)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Vistas (videos acá cargados)</div>
          <div className="stat-value">{fmt(totalViews)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Publicados / Programados</div>
          <div className="stat-value">{publishedCount} / {scheduledCount}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "1rem" }}>Programar video</h2>
        <YoutubeVideoForm pillars={pillars.map((p) => ({ id: p.id, label: p.label }))} />
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text-secondary)" }}>
          {gridRows.length} video{gridRows.length !== 1 ? "s" : ""} publicado{gridRows.length !== 1 ? "s" : ""}
        </h2>
        <YoutubeVideoGrid rows={gridRows} />
      </div>

      {pendingRows.length > 0 && (
        <div className="card">
          <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "1.25rem", color: "var(--text-secondary)" }}>
            {pendingRows.length} pendiente{pendingRows.length !== 1 ? "s" : ""} (programados / borradores / con error)
          </h2>
          <YoutubeVideoList videos={pendingRows} />
        </div>
      )}
    </main>
  );
}
