import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { posts } from "@/db/schema";
import { getConnectedAccount } from "@/lib/instagram/account-store";
import { syncPostInsights, snapshotAccount } from "@/lib/instagram/sync";
import { importNewMedia } from "@/lib/instagram/import";
import { classifyImportedPosts } from "@/lib/pillars/classify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sincroniza en el momento los posts más recientes (los que más cambian).
// El histórico completo lo cubre el cron de GitHub Actions 3 veces por día.
const RECENT_LIMIT = 10;

export async function POST() {
  const account = await getConnectedAccount();
  if (!account) {
    return NextResponse.json({ error: "No hay cuenta conectada" }, { status: 400 });
  }

  const errors: string[] = [];

  // Descubrimiento: posts publicados directo en Instagram (sin pasar por la
  // app) antes de sincronizar métricas — mismo motivo que el cron
  // (scripts/sync-post-metrics.ts). Tolerante a fallos: si esto falla, el
  // botón igual sincroniza las métricas de los posts que ya conocíamos.
  try {
    const { imported, newPostIds } = await importNewMedia(account);
    if (imported > 0) {
      try {
        await classifyImportedPosts(() => {}, newPostIds);
      } catch (err) {
        errors.push(`clasificación: ${err instanceof Error ? err.message : "error"}`);
      }
    }
  } catch (err) {
    errors.push(`descubrimiento: ${err instanceof Error ? err.message : "error"}`);
  }

  const recent = await db.query.posts.findMany({
    where: eq(posts.status, "PUBLISHED"),
    orderBy: [desc(posts.publishedAt)],
    limit: RECENT_LIMIT,
  });

  let synced = 0;

  try {
    await snapshotAccount(account);
  } catch (err) {
    errors.push(`cuenta: ${err instanceof Error ? err.message : "error"}`);
  }

  for (const post of recent) {
    if (!post.igMediaId) continue;
    try {
      if (await syncPostInsights(post, account)) synced++;
    } catch (err) {
      errors.push(`post #${post.id}: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  return NextResponse.json({ synced, total: recent.length, errors });
}
