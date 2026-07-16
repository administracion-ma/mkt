import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { posts, pillars } from "@/db/schema";
import { getAllInstagramMedia, getRecentInstagramMedia, type IgRecentMedia } from "@/lib/instagram/graph-api";

type Account = { igUserId: string; accessToken: string };

const MEDIA_TYPE_MAP: Record<string, "IMAGE" | "VIDEO" | "REELS" | "CAROUSEL_ALBUM"> = {
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
  REELS: "REELS",
  CAROUSEL_ALBUM: "CAROUSEL_ALBUM",
};

// Pilar por defecto para posts descubiertos que la app nunca programó (se
// publicaron directo en Instagram) — mismo criterio que usaba históricamente
// scripts/import-instagram-history.ts: el primer pilar por id, o "importado"
// si todavía no hay ninguno cargado.
async function getDefaultPillar() {
  let defaultPillar = await db.query.pillars.findFirst({
    orderBy: (p, { asc }) => [asc(p.id)],
  });
  if (!defaultPillar) {
    const [created] = await db
      .insert(pillars)
      .values({ key: "importado", label: "Importado de Instagram" })
      .returning();
    defaultPillar = created;
  }
  return defaultPillar;
}

// Inserta los media que todavía no existen en `posts` (por igMediaId).
// Devuelve cuántos insertó y los ids nuevos de la tabla `posts`, para que
// quien llama pueda clasificarlos o sincronizarles métricas sin tocar el resto.
async function insertNewMedia(mediaList: IgRecentMedia[]): Promise<{ imported: number; newPostIds: number[] }> {
  if (mediaList.length === 0) return { imported: 0, newPostIds: [] };

  const defaultPillar = await getDefaultPillar();
  const newPostIds: number[] = [];

  for (const media of mediaList) {
    const existing = await db.query.posts.findFirst({
      where: eq(posts.igMediaId, media.id),
    });
    if (existing) continue;

    const mediaType = MEDIA_TYPE_MAP[media.mediaType] ?? "IMAGE";
    const publishedAt = new Date(media.timestamp);

    const [created] = await db
      .insert(posts)
      .values({
        pillarId: defaultPillar.id,
        caption: media.caption ?? "",
        mediaType,
        mediaUrl: media.mediaUrl ?? media.permalink,
        videoDurationMs: media.videoDurationMs ?? null,
        scheduledAt: publishedAt,
        status: "PUBLISHED",
        igMediaId: media.id,
        igPermalink: media.permalink,
        publishedAt,
      })
      .returning({ id: posts.id });

    newPostIds.push(created.id);
  }

  return { imported: newPostIds.length, newPostIds };
}

// Descubrimiento incremental: se llama en cada sync (cron y botón "Sincronizar
// ahora") para traer los posts publicados directo en Instagram —sin pasar por
// la app— antes de que el semáforo de salud del Panel los dé por "no
// publicados". Solo pide la primera página (los más recientes): alcanza
// porque se corre varias veces por día.
export async function importNewMedia(
  account: Account,
  opts?: { limit?: number }
): Promise<{ imported: number; newPostIds: number[] }> {
  const media = await getRecentInstagramMedia(account.igUserId, account.accessToken, opts?.limit ?? 25);
  return insertNewMedia(media);
}

// Historial completo — usada por scripts/import-instagram-history.ts (import
// manual, una sola vez, para poblar todo lo que la app nunca vio).
export async function importAllMedia(
  account: Account
): Promise<{ imported: number; newPostIds: number[]; total: number }> {
  const allMedia = await getAllInstagramMedia(account.igUserId, account.accessToken);
  const { imported, newPostIds } = await insertNewMedia(allMedia);
  return { imported, newPostIds, total: allMedia.length };
}
