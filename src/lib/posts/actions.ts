"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { posts } from "@/db/schema";

export async function createPost(formData: FormData) {
  const pillarId = Number(formData.get("pillarId"));
  const caption = String(formData.get("caption") ?? "").trim();
  const mediaType = String(formData.get("mediaType") ?? "");
  const mediaUrl = String(formData.get("mediaUrl") ?? "").trim();
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "");

  if (!pillarId || !caption || !mediaUrl || !scheduledAtRaw) {
    throw new Error("Faltan campos obligatorios");
  }
  if (mediaType !== "IMAGE" && mediaType !== "VIDEO" && mediaType !== "REELS") {
    throw new Error("Tipo de contenido inválido");
  }

  const scheduledAt = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error("Fecha y hora inválida");
  }

  await db.insert(posts).values({
    pillarId,
    caption,
    mediaType,
    mediaUrl,
    scheduledAt,
    status: "SCHEDULED",
  });

  revalidatePath("/calendar");
}

export async function deletePost(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) {
    throw new Error("Falta el id del post");
  }

  await db.delete(posts).where(eq(posts.id, id));

  revalidatePath("/calendar");
}
