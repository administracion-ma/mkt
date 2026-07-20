import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { postMetrics, posts } from "@/db/schema";
import type { InsightRow } from "@/lib/insights";

// Posts publicados + último snapshot de métricas por post.
// Lo comparten la página de analítica y el endpoint del informe IA.
export async function getAnalyticsRows(from?: Date, to?: Date): Promise<InsightRow[]> {
  const publishedPosts = await db.query.posts.findMany({
    where: and(
      eq(posts.status, "PUBLISHED"),
      from ? gte(posts.publishedAt, from) : undefined,
      to ? lte(posts.publishedAt, to) : undefined,
    ),
    orderBy: (p, { desc }) => [desc(p.publishedAt)],
  });

  if (publishedPosts.length === 0) return [];

  // Antes se leía la tabla ENTERA de métricas (todas las filas históricas de
  // todos los posts) y encima dos veces por render en el panel. Con la data
  // creciendo, eso se volvía lento y podía colgar la conexión hasta el 504.
  // Ahora traemos solo las métricas de los posts de este rango.
  const allMetrics = await db.query.postMetrics.findMany({
    where: inArray(postMetrics.postId, publishedPosts.map((p) => p.id)),
    orderBy: (m, { desc }) => [desc(m.capturedAt)],
  });

  const latest = new Map<number, (typeof allMetrics)[0]>();
  for (const m of allMetrics) {
    if (!latest.has(m.postId)) latest.set(m.postId, m);
  }

  return publishedPosts.map((p) => {
    const m = latest.get(p.id);
    return {
      id: p.id,
      igMediaId: p.igMediaId ?? null,
      pillarId: p.pillarId ?? null,
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
      profileVisits: m?.profileVisits ?? null,
    };
  });
}
