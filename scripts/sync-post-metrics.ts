import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { posts } from "../src/db/schema";
import { getConnectedAccount } from "../src/lib/instagram/account-store";
import { syncPostInsights, snapshotAccount } from "../src/lib/instagram/sync";

async function main() {
  const account = await getConnectedAccount();
  if (!account) {
    console.log("No hay ninguna cuenta de Instagram conectada.");
    return;
  }

  try {
    await snapshotAccount(account);
    console.log("Snapshot de cuenta OK.");
  } catch (err) {
    console.error("Snapshot de cuenta FALLÓ:", err instanceof Error ? err.message : err);
  }

  const publishedPosts = await db.query.posts.findMany({
    where: eq(posts.status, "PUBLISHED"),
  });

  const withMedia = publishedPosts.filter((p) => p.igMediaId);
  if (withMedia.length === 0) {
    console.log("No hay posts publicados con media ID.");
    return;
  }

  console.log(`Sincronizando métricas de ${withMedia.length} post(s)...`);

  for (const post of withMedia) {
    console.log(`-> Post #${post.id} (${post.igMediaId})`);
    try {
      const ok = await syncPostInsights(post, account);
      console.log(ok ? "   OK" : "   Sin datos de API, preservando métricas anteriores.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      console.error(`   FALLÓ: ${message}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
