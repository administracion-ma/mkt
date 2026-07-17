import { and, eq, gte, isNotNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokVideos, tiktokVideoMetrics, tiktokAccountMetrics } from "@/db/schema";
import { getAccountStats, listVideos, fetchPublishStatus, type TiktokVideoInfo } from "@/lib/tiktok/api";

type Account = { openId: string; accessToken: string };

async function fetchAllVideos(accessToken: string): Promise<TiktokVideoInfo[]> {
  const all: TiktokVideoInfo[] = [];
  let cursor: string | undefined;
  // Tope de 20 páginas (~400 videos) — suficiente margen para no paginar para
  // siempre si algo en la respuesta de TikTok queda mal formado.
  for (let page = 0; page < 20; page++) {
    const { videos, nextCursor, hasMore } = await listVideos(accessToken, cursor);
    all.push(...videos);
    if (!hasMore || !nextCursor) break;
    cursor = nextCursor;
  }
  return all;
}

// Descubre videos subidos directo a TikTok (fuera de la app) y sincroniza
// sus métricas en la misma pasada — a diferencia de YouTube, la Display API
// da vistas/likes/comentarios/shares en el mismo listado, sin llamada aparte
// por video. También "backfillea" tiktok_url en videos publicados desde acá
// cuyo share_url recién se conoce cuando TikTok termina de procesarlos.
export async function importAndSyncTiktokVideos(account: Account): Promise<{ imported: number; synced: number }> {
  const remoteVideos = await fetchAllVideos(account.accessToken);
  if (remoteVideos.length === 0) return { imported: 0, synced: 0 };

  const localVideos = await db.query.tiktokVideos.findMany({
    where: isNotNull(tiktokVideos.tiktokVideoId),
  });
  const localByTiktokId = new Map(localVideos.map((v) => [v.tiktokVideoId, v]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  let imported = 0;
  let synced = 0;

  for (const remote of remoteVideos) {
    let local = localByTiktokId.get(remote.videoId);

    if (!local) {
      const publishedAt = new Date(remote.createTime * 1000);
      const [created] = await db
        .insert(tiktokVideos)
        .values({
          title: remote.title,
          videoFileUrl: remote.shareUrl,
          privacyLevel: "PUBLIC_TO_EVERYONE", // ya está publicado, no sabemos con qué privacidad salió
          scheduledAt: publishedAt,
          status: "PUBLISHED",
          tiktokVideoId: remote.videoId,
          tiktokUrl: remote.shareUrl,
          coverImageUrl: remote.coverImageUrl,
          publishedAt,
        })
        .returning();
      local = created;
      imported++;
    } else {
      // La portada expira — se refresca en cada sync. tiktokUrl solo se
      // completa la primera vez que se conoce (publicado desde la app).
      await db
        .update(tiktokVideos)
        .set({ tiktokUrl: local.tiktokUrl ?? remote.shareUrl, coverImageUrl: remote.coverImageUrl, updatedAt: new Date() })
        .where(eq(tiktokVideos.id, local.id));
    }

    const metricsData = { views: remote.views, likes: remote.likes, comments: remote.comments, shares: remote.shares, capturedAt: new Date() };
    const hasData = remote.views != null || remote.likes != null || remote.comments != null || remote.shares != null;
    if (!hasData) continue;

    const existingToday = await db.query.tiktokVideoMetrics.findFirst({
      where: and(eq(tiktokVideoMetrics.videoId, local.id), gte(tiktokVideoMetrics.capturedAt, today), lt(tiktokVideoMetrics.capturedAt, tomorrow)),
    });
    if (existingToday) {
      await db.update(tiktokVideoMetrics).set(metricsData).where(eq(tiktokVideoMetrics.id, existingToday.id));
    } else {
      await db.insert(tiktokVideoMetrics).values({ videoId: local.id, ...metricsData });
    }
    synced++;
  }

  return { imported, synced };
}

// Los videos publicados desde la app quedan en PUBLISHING con un publishId
// hasta que TikTok termina de procesarlos (puede tardar de segundos a
// minutos) — acá se resuelve el estado final en cada sync.
export async function resolvePendingPublishes(account: Account): Promise<void> {
  const pending = await db.query.tiktokVideos.findMany({
    where: and(eq(tiktokVideos.status, "PUBLISHING"), isNotNull(tiktokVideos.publishId)),
  });

  for (const video of pending) {
    if (!video.publishId) continue;
    try {
      const result = await fetchPublishStatus(account.accessToken, video.publishId);
      if (result.status === "PUBLISH_COMPLETE") {
        await db
          .update(tiktokVideos)
          .set({ status: "PUBLISHED", tiktokVideoId: result.videoId, publishedAt: new Date(), publishError: null, updatedAt: new Date() })
          .where(eq(tiktokVideos.id, video.id));
      } else if (result.status === "FAILED") {
        await db
          .update(tiktokVideos)
          .set({ status: "FAILED", publishError: result.failReason ?? "TikTok reportó un error al procesar el video.", updatedAt: new Date() })
          .where(eq(tiktokVideos.id, video.id));
      }
      // Otros estados (PROCESSING_*, SEND_TO_USER_INBOX) — sigue en curso, no tocar.
    } catch {
      // Tolerante: se reintenta en el próximo sync.
    }
  }
}

export async function snapshotAccount(account: Account): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const stats = await getAccountStats(account.accessToken);

  const existingToday = await db.query.tiktokAccountMetrics.findFirst({
    where: and(gte(tiktokAccountMetrics.capturedAt, today), lt(tiktokAccountMetrics.capturedAt, tomorrow)),
  });

  if (existingToday) {
    await db
      .update(tiktokAccountMetrics)
      .set({ followerCount: stats.followerCount, likesCount: stats.likesCount, videoCount: stats.videoCount, capturedAt: new Date() })
      .where(eq(tiktokAccountMetrics.id, existingToday.id));
  } else {
    await db.insert(tiktokAccountMetrics).values({ followerCount: stats.followerCount, likesCount: stats.likesCount, videoCount: stats.videoCount });
  }
}

// Corrida completa: snapshot de cuenta + resolver publicaciones pendientes +
// descubrir/sincronizar videos. Compartida entre el botón de /admin y el cron.
export async function syncAllTiktok(account: Account): Promise<{ imported: number; synced: number }> {
  await snapshotAccount(account).catch(() => {});
  await resolvePendingPublishes(account).catch(() => {});
  return importAndSyncTiktokVideos(account);
}
