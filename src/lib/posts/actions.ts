"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { db } from "@/db/client";
import { posts } from "@/db/schema";
import { getConnectedAccount } from "@/lib/instagram/account-store";
import { publishPost } from "@/lib/instagram/publish-post";

function optionalString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function createPost(formData: FormData) {
  const pillarId = Number(formData.get("pillarId"));
  const caption = String(formData.get("caption") ?? "").trim();
  const mediaType = String(formData.get("mediaType") ?? "");
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "");
  const mediaFile = formData.get("mediaFile");
  const publishNow = formData.get("publishNow") === "1";

  const productionStatus = optionalString(formData, "productionStatus");
  const channel = optionalString(formData, "channel");
  const format = optionalString(formData, "format");
  const editorIdRaw = optionalString(formData, "editorId");
  const rawFootageUrl = optionalString(formData, "rawFootageUrl");

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

  const [post] = await db
    .insert(posts)
    .values({
      pillarId,
      caption,
      mediaType,
      mediaUrl: blob.url,
      scheduledAt,
      status: "SCHEDULED",
      productionStatus: productionStatus as typeof posts.$inferInsert.productionStatus,
      channel: channel as typeof posts.$inferInsert.channel,
      format: format as typeof posts.$inferInsert.format,
      editorId: editorIdRaw ? Number(editorIdRaw) : null,
      rawFootageUrl,
    })
    .returning();

  if (publishNow) {
    const account = await getConnectedAccount();
    if (!account) {
      throw new Error("No hay cuenta de Instagram conectada para publicar ahora");
    }
    await publishPost(post, account);
  }

  revalidatePath("/calendar");
}

export async function publishPostNow(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) throw new Error("Falta el id del post");

  const post = await db.query.posts.findFirst({ where: eq(posts.id, id) });
  if (!post) throw new Error("Post no encontrado");

  const account = await getConnectedAccount();
  if (!account) throw new Error("No hay cuenta de Instagram conectada");

  await publishPost(post, account);
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
