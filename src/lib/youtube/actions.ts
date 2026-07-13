"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { youtubeVideos } from "@/db/schema";
import { getConnectedYoutubeAccount } from "@/lib/youtube/account-store";
import { publishYoutubeVideo } from "@/lib/youtube/publish";
import { syncAllYoutube } from "@/lib/youtube/sync";
import { listUploadedVideos } from "@/lib/youtube/api";

// El archivo ya está subido a Blob del lado del cliente (ver YoutubeVideoForm)
// antes de llamar a esta action — acá solo llega la URL, nunca el binario,
// para no toparse con el límite de tamaño de Server Actions.
export async function createYoutubeVideo(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const videoFileUrl = String(formData.get("videoFileUrl") ?? "").trim();
  const privacyStatus = String(formData.get("privacyStatus") ?? "public");
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "");
  const pillarIdRaw = String(formData.get("pillarId") ?? "");
  const publishNow = formData.get("publishNow") === "1";

  if (!title || !videoFileUrl || !scheduledAtRaw) {
    throw new Error("Faltan campos obligatorios");
  }
  if (privacyStatus !== "public" && privacyStatus !== "unlisted" && privacyStatus !== "private") {
    throw new Error("Privacidad inválida");
  }
  const scheduledAt = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error("Fecha y hora inválida");
  }

  const [video] = await db
    .insert(youtubeVideos)
    .values({
      title,
      description,
      videoFileUrl,
      privacyStatus,
      scheduledAt,
      status: "SCHEDULED",
      pillarId: pillarIdRaw ? Number(pillarIdRaw) : null,
    })
    .returning();

  if (publishNow) {
    const account = await getConnectedYoutubeAccount();
    if (!account) throw new Error("No hay cuenta de YouTube conectada para publicar ahora");
    await publishYoutubeVideo(video, account.accessToken);
  }

  revalidatePath("/youtube");
}

export async function publishYoutubeVideoNow(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) throw new Error("Falta el id del video");

  const video = await db.query.youtubeVideos.findFirst({ where: eq(youtubeVideos.id, id) });
  if (!video) throw new Error("Video no encontrado");

  const account = await getConnectedYoutubeAccount();
  if (!account) throw new Error("No hay cuenta de YouTube conectada");

  await publishYoutubeVideo(video, account.accessToken);
  revalidatePath("/youtube");
}

export async function deleteYoutubeVideo(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) throw new Error("Falta el id del video");

  await db.delete(youtubeVideos).where(eq(youtubeVideos.id, id));
  revalidatePath("/youtube");
}

// Botón "Importar videos existentes" en /admin — trae el historial del canal
// (videos subidos directo a YouTube, no desde la app) para que tengan
// métricas acá también. Mismo espíritu que import-instagram-history.
export async function runYoutubeImport(): Promise<{ ok: boolean; message: string }> {
  try {
    const account = await getConnectedYoutubeAccount();
    if (!account) return { ok: false, message: "No hay ningún canal de YouTube conectado todavía." };

    const uploaded = await listUploadedVideos(account.accessToken, account.channelId);
    if (uploaded.length === 0) return { ok: true, message: "El canal no tiene videos subidos." };

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

    revalidatePath("/youtube");
    return {
      ok: true,
      message: `${imported} video(s) importados (${uploaded.length - imported} ya existían). Ahora tocá "Sincronizar YouTube" para traer sus métricas.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error desconocido" };
  }
}

// Botón "Sincronizar YouTube ahora" en /admin — mismo patrón que runAdsSync.
export async function runYoutubeSync(): Promise<{ ok: boolean; message: string }> {
  try {
    const account = await getConnectedYoutubeAccount();
    if (!account) return { ok: false, message: "No hay ningún canal de YouTube conectado todavía." };

    const { synced, total } = await syncAllYoutube(account);

    revalidatePath("/youtube");
    return { ok: true, message: `${synced} de ${total} video(s) sincronizados. Canal actualizado.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error desconocido" };
  }
}
