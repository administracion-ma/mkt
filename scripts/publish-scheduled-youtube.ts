import { and, eq, lte } from "drizzle-orm";
import { db } from "../src/db/client";
import { youtubeVideos } from "../src/db/schema";
import { getConnectedYoutubeAccount } from "../src/lib/youtube/account-store";
import { publishYoutubeVideo } from "../src/lib/youtube/publish";

async function main() {
  const account = await getConnectedYoutubeAccount();
  if (!account) {
    console.log("No hay ningún canal de YouTube conectado, nada para publicar.");
    return;
  }

  const dueVideos = await db.query.youtubeVideos.findMany({
    where: and(eq(youtubeVideos.status, "SCHEDULED"), lte(youtubeVideos.scheduledAt, new Date())),
    orderBy: (v, { asc }) => [asc(v.scheduledAt)],
  });

  if (dueVideos.length === 0) {
    console.log("No hay videos pendientes de publicar.");
    return;
  }

  console.log(`Publicando ${dueVideos.length} video(s)...`);

  for (const video of dueVideos) {
    console.log(`-> Video #${video.id} (${video.title})`);
    try {
      await publishYoutubeVideo(video, account.accessToken);
      console.log("   OK");
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
