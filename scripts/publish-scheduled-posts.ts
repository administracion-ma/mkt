import { and, eq, lte } from "drizzle-orm";
import { db } from "../src/db/client";
import { posts } from "../src/db/schema";
import { getConnectedAccount } from "../src/lib/instagram/account-store";
import { publishToInstagram } from "../src/lib/instagram/publish";

async function main() {
  const account = await getConnectedAccount();
  if (!account) {
    console.log("No hay ninguna cuenta de Instagram conectada, nada para publicar.");
    return;
  }

  const duePosts = await db.query.posts.findMany({
    where: and(eq(posts.status, "SCHEDULED"), lte(posts.scheduledAt, new Date())),
    orderBy: (p, { asc }) => [asc(p.scheduledAt)],
  });

  if (duePosts.length === 0) {
    console.log("No hay posts pendientes de publicar.");
    return;
  }

  console.log(`Publicando ${duePosts.length} post(s)...`);

  for (const post of duePosts) {
    console.log(`-> Post #${post.id} (${post.mediaType})`);

    await db
      .update(posts)
      .set({ status: "PUBLISHING", updatedAt: new Date() })
      .where(eq(posts.id, post.id));

    try {
      const { igMediaId, igPermalink } = await publishToInstagram({
        igUserId: account.igUserId,
        accessToken: account.accessToken,
        mediaUrl: post.mediaUrl,
        caption: post.caption,
        mediaType: post.mediaType,
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

      console.log(`   OK -> ${igPermalink ?? igMediaId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      console.error(`   FALLÓ: ${message}`);

      await db
        .update(posts)
        .set({ status: "FAILED", publishError: message, updatedAt: new Date() })
        .where(eq(posts.id, post.id));
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
