"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { db } from "@/db/client";
import { posts } from "@/db/schema";

export async function createPost(formData: FormData) {
  const pillarId = Number(formData.get("pillarId"));
  const caption = String(formData.get("caption") ?? "").trim();
  const mediaType = String(formData.get("mediaType") ?? "");
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "");
  const mediaFile = formData.get("mediaFile");

  if (!pillarId || !caption || !scheduledAtRaw) {
    throw new Error("Faltan campos obligatorios");
  }
  if (mediaType !== "IMAGE" && mediaType !== "VIDEO" && mediaType !== "REELS") {
    throw new Error("Tipo de contenido inválido");
  }
  if (!(mediaFile instanceof File) || mediaFile.size === 0) {
    throw new Error("Falta el archivo a subir");
  }

  const scheduledAt = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error("Fecha y hora inválida");
  }

  const blob = await put(`posts/${Date.now()}-${mediaFile.name}`, mediaFile, {
    access: "public",
  });

  await db.insert(posts).values({
    pillarId,
    caption,
    mediaType,
    mediaUrl: blob.url,
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
