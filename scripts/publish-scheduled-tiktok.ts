import { and, eq, lte } from "drizzle-orm";
import { db } from "../src/db/client";
import { tiktokVideos } from "../src/db/schema";
import { getConnectedTiktokAccount } from "../src/lib/tiktok/account-store";
import { publishTiktokVideo } from "../src/lib/tiktok/publish";

async function main() {
  const account = await getConnectedTiktokAccount();
  if (!account) {
    console.log("No hay ninguna cuenta de TikTok conectada, nada para publicar.");
    return;
  }

  const dueVideos = await db.query.tiktokVideos.findMany({
    where: and(eq(tiktokVideos.status, "SCHEDULED"), lte(tiktokVideos.scheduledAt, new Date())),
    orderBy: (v, { asc }) => [asc(v.scheduledAt)],
  });

  if (dueVideos.length === 0) {
    console.log("No hay videos pendientes de publicar.");
    return;
  }

  console.log(`Publicando ${dueVideos.length} video(s)...`);

  for (const video of dueVideos) {
    console.log(`-> Video #${video.id} (${video.title || "sin título"})`);
    try {
      await publishTiktokVideo(video, account.accessToken);
      console.log("   Iniciado en TikTok — se resuelve solo en el próximo sync.");
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
