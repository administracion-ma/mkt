import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { posts, postMetrics } from "@/db/schema";
import type { InsightRow } from "@/lib/insights";

// Posts publicados + último snapshot de métricas por post.
// Lo comparten la página de analítica y el endpoint del informe IA.
export async function getAnalyticsRows(from?: Date, to?: Date): Promise<InsightRow[]> {
  const [publishedPosts, allMetrics] = await Promise.all([
    db.query.posts.findMany({
      where: and(
        eq(posts.status, "PUBLISHED"),
        from ? gte(posts.publishedAt, from) : undefined,
        to ? lte(posts.publishedAt, to) : undefined,
      ),
      orderBy: (p, { desc }) => [desc(p.publishedAt)],
    }),
    db.query.postMetrics.findMany({
      orderBy: (m, { desc }) => [desc(m.capturedAt)],
    }),
  ]);

  const latest = new Map<number, (typeof allMetrics)[0]>();
  for (const m of allMetrics) {
    if (!latest.has(m.postId)) latest.set(m.postId, m);
  }

  return publishedPosts.map((p) => {
    const m = latest.get(p.id);
    return {
      id: p.id,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
      mediaType: p.mediaType,
      caption: p.caption ?? null,
      igPermalink: p.igPermalink ?? null,
      mediaUrl: p.mediaUrl ?? null,
      videoDurationMs: p.videoDurationMs ?? null,
      reach: m?.reach ?? null,
      plays: m?.plays ?? null,
      likeCount: m?.likeCount ?? null,
      commentCount: m?.commentCount ?? null,
      savedCount: m?.savedCount ?? null,
      sharesCount: m?.sharesCount ?? null,
      avgWatchTimeMs: m?.avgWatchTimeMs ?? null,
      skipRate: m?.skipRate ?? null,
      followsCount: m?.followsCount ?? null,
    };
  });
}
