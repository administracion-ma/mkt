import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { posts } from "../src/db/schema";
import { getConnectedAccount } from "../src/lib/instagram/account-store";
import { syncPostInsights, snapshotAccount } from "../src/lib/instagram/sync";
import { importNewMedia } from "../src/lib/instagram/import";
import { classifyImportedPosts } from "../src/lib/pillars/classify";

async function main() {
  const account = await getConnectedAccount();
  if (!account) {
    console.log("No hay ninguna cuenta de Instagram conectada.");
    return;
  }

  // Descubrimiento: si publicaron un post directo en Instagram (sin pasar
  // por la app), nunca entra a `posts` y el loop de métricas de abajo ni se
  // entera de que existe. Se hace ANTES para que reciba métricas en esta
  // misma corrida. Tolerante a fallos: si la Graph API se cae, el sync de
  // los posts ya conocidos tiene que seguir andando igual.
  try {
    const { imported, newPostIds } = await importNewMedia(account);
    if (imported > 0) {
      console.log(`Descubiertos ${imported} post(s) nuevo(s) publicados directo en Instagram.`);
      try {
        await classifyImportedPosts((msg) => console.log(`   [clasificación] ${msg}`), newPostIds);
      } catch (err) {
        console.error(
          "Clasificación de posts nuevos FALLÓ (quedan en el pilar por defecto):",
          err instanceof Error ? err.message : err
        );
      }
    }
  } catch (err) {
    console.error("Descubrimiento de posts nuevos FALLÓ:", err instanceof Error ? err.message : err);
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
