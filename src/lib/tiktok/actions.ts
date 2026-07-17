"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { tiktokVideos } from "@/db/schema";
import { getConnectedTiktokAccount } from "@/lib/tiktok/account-store";
import { publishTiktokVideo } from "@/lib/tiktok/publish";
import { syncAllTiktok } from "@/lib/tiktok/sync";

// El archivo ya está subido a Blob del lado del cliente (ver TiktokVideoForm)
// antes de llamar a esta action — acá solo llega la URL, nunca el binario,
// mismo motivo que YouTube (límite de tamaño de Server Actions).
export async function createTiktokVideo(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const videoFileUrl = String(formData.get("videoFileUrl") ?? "").trim();
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "");
  const pillarIdRaw = String(formData.get("pillarId") ?? "");
  const publishNow = formData.get("publishNow") === "1";

  if (!videoFileUrl || !scheduledAtRaw) {
    throw new Error("Faltan campos obligatorios");
  }
  const scheduledAt = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error("Fecha y hora inválida");
  }

  const [video] = await db
    .insert(tiktokVideos)
    .values({
      title,
      videoFileUrl,
      // Sin auditoría de TikTok, cualquier privacidad que no sea SELF_ONLY
      // la va a bajar TikTok solo — se pide siempre así para no confundir
      // con una opción que hoy no tiene efecto real.
      privacyLevel: "SELF_ONLY",
      scheduledAt,
      status: "SCHEDULED",
      pillarId: pillarIdRaw ? Number(pillarIdRaw) : null,
    })
    .returning();

  if (publishNow) {
    const account = await getConnectedTiktokAccount();
    if (!account) throw new Error("No hay cuenta de TikTok conectada para publicar ahora");
    await publishTiktokVideo(video, account.accessToken);
  }

  revalidatePath("/tiktok");
}

export async function publishTiktokVideoNow(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) throw new Error("Falta el id del video");

  const video = await db.query.tiktokVideos.findFirst({ where: eq(tiktokVideos.id, id) });
  if (!video) throw new Error("Video no encontrado");

  const account = await getConnectedTiktokAccount();
  if (!account) throw new Error("No hay cuenta de TikTok conectada");

  await publishTiktokVideo(video, account.accessToken);
  revalidatePath("/tiktok");
}

export async function deleteTiktokVideo(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) throw new Error("Falta el id del video");

  await db.delete(tiktokVideos).where(eq(tiktokVideos.id, id));
  revalidatePath("/tiktok");
}

// Igual que assignCampaignPillar (ads) y assignYoutubeVideoPillar — para
// cruzar TikTok con el mismo pilar de contenido que IG y YouTube.
export async function assignTiktokVideoPillar(videoId: number, pillarId: number | null): Promise<void> {
  await db.update(tiktokVideos).set({ pillarId, updatedAt: new Date() }).where(eq(tiktokVideos.id, videoId));
  revalidatePath("/tiktok");
}

// Botón "Sincronizar TikTok ahora" en /admin — mismo patrón que runYoutubeSync.
export async function runTiktokSync(): Promise<{ ok: boolean; message: string }> {
  try {
    const account = await getConnectedTiktokAccount();
    if (!account) return { ok: false, message: "No hay ninguna cuenta de TikTok conectada todavía." };

    const { imported, synced } = await syncAllTiktok(account);

    revalidatePath("/tiktok");
    return { ok: true, message: `${imported} video(s) nuevo(s) importados, ${synced} sincronizados. Cuenta actualizada.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error desconocido" };
  }
}
