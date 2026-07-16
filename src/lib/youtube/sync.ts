import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { youtubeVideos, youtubeVideoMetrics, youtubeChannelMetrics } from "@/db/schema";
import {
  getVideoAnalytics,
  getChannelSummary,
  getVideosPublicInfo,
  listUploadedVideos,
  type VideoPublicInfo,
} from "@/lib/youtube/api";

type YoutubeVideo = typeof youtubeVideos.$inferSelect;
type Account = { channelId: string; accessToken: string };

// Descubrimiento: videos subidos directo al canal (sin pasar por la app)
// nunca entran a `youtube_videos` salvo que se apriete "Importar videos" en
// /admin. Se usa la playlist "uploads" del canal (mismo espíritu que
// instagram/import.ts) e inserta los que todavía no existen por youtubeVideoId.
// Compartida entre syncAllYoutube (cron) y la server action runYoutubeImport,
// así no hay dos lugares insertando lo mismo.
export async function importNewYoutubeVideos(account: Account): Promise<number> {
  const uploaded = await listUploadedVideos(account.accessToken, account.channelId);
  if (uploaded.length === 0) return 0;

  const existing = await db.query.youtubeVideos.findMany({ columns: { youtubeVideoId: true } });
  const known = new Set(existing.map((v) => v.youtubeVideoId).filter(Boolean));

  let imported = 0;
  for (const v of uploaded) {
    if (known.has(v.videoId)) continue;
    const publishedAt = new Date(v.publishedAt);
    await db.insert(youtubeVideos).values({
      title: v.title,
      description: v.description,
      // Importado: el archivo original no está en Blob, ya vive en YouTube.
      videoFileUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
      privacyStatus: "public",
      scheduledAt: publishedAt,
      status: "PUBLISHED",
      youtubeVideoId: v.videoId,
      youtubeUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
      publishedAt,
    });
    imported++;
  }

  return imported;
}

// Sincroniza las métricas de un video publicado — un snapshot por día, igual
// que instagram/sync.ts::syncPostInsights. `publicInfo` (contadores públicos,
// casi en tiempo real) tapa el agujero de las 24-48h de retraso de la
// Analytics API en videos recientes.
export async function syncVideoInsights(video: YoutubeVideo, account: Account, publicInfo?: VideoPublicInfo): Promise<boolean> {
  if (!video.youtubeVideoId || !video.publishedAt) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const startDate = video.publishedAt.toISOString().slice(0, 10);
  const endDate = today.toISOString().slice(0, 10);

  const insights = await getVideoAnalytics(account.accessToken, account.channelId, video.youtubeVideoId, startDate, endDate)
    .catch(() => null);

  const metricsData = {
    views: insights?.views ?? publicInfo?.views ?? null,
    likes: insights?.likes ?? publicInfo?.likes ?? null,
    comments: insights?.comments ?? publicInfo?.comments ?? null,
    shares: insights?.shares ?? null,
    averageViewDurationSec: insights?.averageViewDurationSec ?? null,
    averageViewPercentage: insights?.averageViewPercentage ?? null,
    subscribersGained: insights?.subscribersGained ?? null,
    capturedAt: new Date(),
  };

  const hasData = Object.entries(metricsData).some(([k, v]) => k !== "capturedAt" && v != null);
  if (!hasData) return false;

  const existingToday = await db.query.youtubeVideoMetrics.findFirst({
    where: and(
      eq(youtubeVideoMetrics.videoId, video.id),
      gte(youtubeVideoMetrics.capturedAt, today),
      lt(youtubeVideoMetrics.capturedAt, tomorrow)
    ),
  });

  if (existingToday) {
    const nonNullUpdate = Object.fromEntries(Object.entries(metricsData).filter(([, v]) => v != null));
    await db.update(youtubeVideoMetrics).set(nonNullUpdate).where(eq(youtubeVideoMetrics.id, existingToday.id));
  } else {
    await db.insert(youtubeVideoMetrics).values({ videoId: video.id, ...metricsData });
  }

  return true;
}

// Corrida completa: snapshot del canal + métricas de cada video publicado.
// Compartida entre el botón de /admin y el cron (scripts/sync-youtube.ts).
// De paso completa duración y si es Short (una sola vez por video).
export async function syncAllYoutube(account: Account): Promise<{ synced: number; total: number }> {
  // Descubrimiento: si subieron un video directo al canal (sin pasar por la
  // app), nunca entra a `youtube_videos` y el sync de abajo ni se entera.
  // Tolerante a fallos — si la API falla acá, el sync de los videos ya
  // conocidos tiene que seguir andando igual.
  try {
    await importNewYoutubeVideos(account);
  } catch (err) {
    console.error("Descubrimiento de videos de YouTube FALLÓ:", err instanceof Error ? err.message : err);
  }

  await snapshotChannel(account);

  const published = await db.query.youtubeVideos.findMany({ where: eq(youtubeVideos.status, "PUBLISHED") });
  const ids = published.map((v) => v.youtubeVideoId).filter((id): id is string => id != null);
  const publicInfo = await getVideosPublicInfo(account.accessToken, ids).catch(() => new Map<string, VideoPublicInfo>());

  // De a 8 en paralelo: uno por uno, con decenas de videos importados, la
  // suma de llamadas a la Analytics API superaba el límite de tiempo de la
  // función de Vercel y el sync moría a la mitad (504).
  const CHUNK = 8;
  let synced = 0;
  for (let i = 0; i < published.length; i += CHUNK) {
    const chunk = published.slice(i, i + CHUNK);
    const results = await Promise.all(
      chunk.map(async (video) => {
        if (!video.youtubeVideoId) return false;
        const info = publicInfo.get(video.youtubeVideoId);

        if (info?.durationSec != null && video.durationSec == null) {
          await db.update(youtubeVideos).set({ durationSec: info.durationSec }).where(eq(youtubeVideos.id, video.id));
        }
        // Se corrige SIEMPRE que difiera (no solo si es null): la detección
        // anterior por URL guardó valores equivocados y hay que pisarlos.
        if (info?.isVertical != null && video.isShort !== info.isVertical) {
          await db.update(youtubeVideos).set({ isShort: info.isVertical }).where(eq(youtubeVideos.id, video.id));
        }

        return syncVideoInsights(video, account, info).catch(() => false);
      })
    );
    synced += results.filter(Boolean).length;
  }

  return { synced, total: published.length };
}

// Snapshot diario del canal (suscriptores/vistas totales) — igual que
// instagram/sync.ts::snapshotAccount.
export async function snapshotChannel(account: Account): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const summary = await getChannelSummary(account.accessToken, account.channelId);

  const existingToday = await db.query.youtubeChannelMetrics.findFirst({
    where: and(gte(youtubeChannelMetrics.capturedAt, today), lt(youtubeChannelMetrics.capturedAt, tomorrow)),
  });

  if (existingToday) {
    await db
      .update(youtubeChannelMetrics)
      .set({ subscriberCount: summary.subscriberCount, viewCount: summary.viewCount, capturedAt: new Date() })
      .where(eq(youtubeChannelMetrics.id, existingToday.id));
  } else {
    await db.insert(youtubeChannelMetrics).values({ subscriberCount: summary.subscriberCount, viewCount: summary.viewCount });
  }
}
