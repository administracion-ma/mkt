"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { youtubeVideos } from "@/db/schema";
import { getConnectedYoutubeAccount } from "@/lib/youtube/account-store";
import { publishYoutubeVideo } from "@/lib/youtube/publish";
import { syncAllYoutube, importNewYoutubeVideos } from "@/lib/youtube/sync";

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

// Igual que assignCampaignPillar (ads) — para cruzar el rendimiento de
// YouTube con el mismo pilar de contenido que IG orgánico y pauta.
export async function assignYoutubeVideoPillar(videoId: number, pillarId: number | null): Promise<void> {
  await db.update(youtubeVideos).set({ pillarId, updatedAt: new Date() }).where(eq(youtubeVideos.id, videoId));
  revalidatePath("/youtube");
  revalidatePath("/ads");
}

// Botón "Importar videos existentes" en /admin — trae el historial del canal
// (videos subidos directo a YouTube, no desde la app) para que tengan
// métricas acá también. Mismo espíritu que import-instagram-history.
export async function runYoutubeImport(): Promise<{ ok: boolean; message: string }> {
  try {
    const account = await getConnectedYoutubeAccount();
    if (!account) return { ok: false, message: "No hay ningún canal de YouTube conectado todavía." };

    const imported = await importNewYoutubeVideos(account);

    revalidatePath("/youtube");
    return {
      ok: true,
      message: `${imported} video(s) importados. Ahora tocá "Sincronizar YouTube" para traer sus métricas.`,
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
