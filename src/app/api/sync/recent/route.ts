import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { posts } from "@/db/schema";
import { getConnectedAccount } from "@/lib/instagram/account-store";
import { syncPostInsights, snapshotAccount } from "@/lib/instagram/sync";

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

  const recent = await db.query.posts.findMany({
    where: eq(posts.status, "PUBLISHED"),
    orderBy: [desc(posts.publishedAt)],
    limit: RECENT_LIMIT,
  });

  let synced = 0;
  const errors: string[] = [];

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
