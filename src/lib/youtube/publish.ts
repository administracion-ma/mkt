import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { youtubeVideos } from "@/db/schema";
import { startResumableUpload, uploadVideoBytes, getYoutubeUrl } from "@/lib/youtube/api";

type YoutubeVideo = typeof youtubeVideos.$inferSelect;

// Publica un video ya cargado (programado o "ahora mismo") — mismo espíritu
// que instagram/publish-post.ts. El archivo se busca desde la URL de Blob
// donde se subió al programarlo, no se vuelve a pedir al usuario.
export async function publishYoutubeVideo(video: YoutubeVideo, accessToken: string): Promise<void> {
  await db.update(youtubeVideos).set({ status: "PUBLISHING", updatedAt: new Date() }).where(eq(youtubeVideos.id, video.id));

  try {
    const fileRes = await fetch(video.videoFileUrl);
    if (!fileRes.ok) {
      throw new Error(`No se pudo descargar el archivo de video (${fileRes.status})`);
    }
    const mimeType = fileRes.headers.get("content-type") || "video/mp4";
    const bytes = Buffer.from(await fileRes.arrayBuffer());

    const uploadUrl = await startResumableUpload(
      accessToken,
      { title: video.title, description: video.description, privacyStatus: video.privacyStatus },
      bytes.byteLength,
      mimeType
    );
    const { videoId } = await uploadVideoBytes(uploadUrl, bytes, mimeType);

    await db
      .update(youtubeVideos)
      .set({
        status: "PUBLISHED",
        youtubeVideoId: videoId,
        youtubeUrl: getYoutubeUrl(videoId),
        publishedAt: new Date(),
        publishError: null,
        updatedAt: new Date(),
      })
      .where(eq(youtubeVideos.id, video.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    await db.update(youtubeVideos).set({ status: "FAILED", publishError: message, updatedAt: new Date() }).where(eq(youtubeVideos.id, video.id));
    throw err;
  }
}
