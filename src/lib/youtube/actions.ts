"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { youtubeVideos } from "@/db/schema";
import { getConnectedYoutubeAccount } from "@/lib/youtube/account-store";
import { publishYoutubeVideo } from "@/lib/youtube/publish";
import { syncVideoInsights, snapshotChannel } from "@/lib/youtube/sync";

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

// Botón "Sincronizar YouTube ahora" en /admin — mismo patrón que runAdsSync.
export async function runYoutubeSync(): Promise<{ ok: boolean; message: string }> {
  try {
    const account = await getConnectedYoutubeAccount();
    if (!account) return { ok: false, message: "No hay ningún canal de YouTube conectado todavía." };

    const published = await db.query.youtubeVideos.findMany({ where: eq(youtubeVideos.status, "PUBLISHED") });
    let synced = 0;
    for (const video of published) {
      const ok = await syncVideoInsights(video, account).catch(() => false);
      if (ok) synced++;
    }
    await snapshotChannel(account);

    revalidatePath("/youtube");
    return { ok: true, message: `${synced} de ${published.length} video(s) sincronizados. Canal actualizado.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error desconocido" };
  }
}
