import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { youtubeVideos } from "../src/db/schema";
import { getConnectedYoutubeAccount } from "../src/lib/youtube/account-store";
import { syncVideoInsights, snapshotChannel } from "../src/lib/youtube/sync";

async function main() {
  const account = await getConnectedYoutubeAccount();
  if (!account) {
    console.log("No hay ningún canal de YouTube conectado.");
    return;
  }

  try {
    await snapshotChannel(account);
    console.log("Snapshot de canal OK.");
  } catch (err) {
    console.error("Snapshot de canal FALLÓ:", err instanceof Error ? err.message : err);
  }

  const published = await db.query.youtubeVideos.findMany({ where: eq(youtubeVideos.status, "PUBLISHED") });
  if (published.length === 0) {
    console.log("No hay videos publicados.");
    return;
  }

  console.log(`Sincronizando métricas de ${published.length} video(s)...`);

  for (const video of published) {
    console.log(`-> Video #${video.id} (${video.youtubeVideoId})`);
    try {
      const ok = await syncVideoInsights(video, account);
      console.log(ok ? "   OK" : "   Sin datos nuevos.");
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
