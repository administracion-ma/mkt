import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { posts } from "@/db/schema";
import { publishToInstagram } from "@/lib/instagram/publish";

type Post = typeof posts.$inferSelect;
type Account = { igUserId: string; accessToken: string };

// Publica un post ya cargado (programado o "ahora mismo"). Compartido entre
// el cron de publicación programada y el botón "Publicar ahora" del calendario.
export async function publishPost(post: Post, account: Account): Promise<void> {
  await db.update(posts).set({ status: "PUBLISHING", updatedAt: new Date() }).where(eq(posts.id, post.id));

  try {
    const { igMediaId, igPermalink } = await publishToInstagram({
      igUserId: account.igUserId,
      accessToken: account.accessToken,
      mediaUrl: post.mediaUrl,
      caption: post.caption,
      mediaType: post.mediaType as "IMAGE" | "VIDEO" | "REELS",
    });

    await db
      .update(posts)
      .set({
        status: "PUBLISHED",
        igMediaId,
        igPermalink,
        publishedAt: new Date(),
        publishError: null,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, post.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    await db.update(posts).set({ status: "FAILED", publishError: message, updatedAt: new Date() }).where(eq(posts.id, post.id));
    throw err;
  }
}
