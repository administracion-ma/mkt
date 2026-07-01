import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { posts, pillars } from "../src/db/schema";
import { getConnectedAccount } from "../src/lib/instagram/account-store";
import { getAllInstagramMedia } from "../src/lib/instagram/graph-api";

const MEDIA_TYPE_MAP: Record<string, "IMAGE" | "VIDEO" | "REELS"> = {
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
  REELS: "REELS",
  CAROUSEL_ALBUM: "IMAGE",
};

async function main() {
  const account = await getConnectedAccount();
  if (!account) {
    console.log("No hay ninguna cuenta de Instagram conectada.");
    return;
  }

  // Get or create default pillar for imported posts
  let defaultPillar = await db.query.pillars.findFirst({
    orderBy: (p, { asc }) => [asc(p.id)],
  });
  if (!defaultPillar) {
    const [created] = await db
      .insert(pillars)
      .values({ key: "importado", label: "Importado de Instagram" })
      .returning();
    defaultPillar = created;
    console.log("Creado pilar por defecto: Importado de Instagram");
  }

  console.log(`Obteniendo historial de @${account.igUsername}...`);
  const allMedia = await getAllInstagramMedia(account.igUserId, account.accessToken);
  console.log(`Total de posts en Instagram: ${allMedia.length}`);

  let imported = 0;
  let skipped = 0;

  for (const media of allMedia) {
    const existing = await db.query.posts.findFirst({
      where: eq(posts.igMediaId, media.id),
    });
    if (existing) {
      skipped++;
      continue;
    }

    const mediaType = MEDIA_TYPE_MAP[media.mediaType] ?? "IMAGE";
    const publishedAt = new Date(media.timestamp);

    await db.insert(posts).values({
      pillarId: defaultPillar.id,
      caption: media.caption ?? "",
      mediaType,
      mediaUrl: media.mediaUrl ?? media.permalink,
      scheduledAt: publishedAt,
      status: "PUBLISHED",
      igMediaId: media.id,
      igPermalink: media.permalink,
      publishedAt,
    });

    imported++;
    process.stdout.write(`\r   Importados: ${imported}  `);
  }

  console.log(`\n\nFin: ${imported} importados, ${skipped} ya existían en la base de datos.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
