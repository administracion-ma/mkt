import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokVideos } from "@/db/schema";
import { initVideoPublish } from "@/lib/tiktok/api";

type TiktokVideo = typeof tiktokVideos.$inferSelect;

// A diferencia de Instagram/YouTube, publicar en TikTok es asíncrono: esto
// solo INICIA la publicación (TikTok descarga el video de nuestra URL en
// segundo plano) — el resultado final (listo o fallido) se resuelve después
// en el sync, ver tiktok/sync.ts::resolvePendingPublishes.
export async function publishTiktokVideo(video: TiktokVideo, accessToken: string): Promise<void> {
  await db.update(tiktokVideos).set({ status: "PUBLISHING", updatedAt: new Date() }).where(eq(tiktokVideos.id, video.id));

  try {
    const { publishId } = await initVideoPublish(accessToken, {
      title: video.title,
      privacyLevel: video.privacyLevel,
      videoUrl: video.videoFileUrl,
    });
    await db.update(tiktokVideos).set({ publishId, publishError: null, updatedAt: new Date() }).where(eq(tiktokVideos.id, video.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    await db.update(tiktokVideos).set({ status: "FAILED", publishError: message, updatedAt: new Date() }).where(eq(tiktokVideos.id, video.id));
    throw err;
  }
}
