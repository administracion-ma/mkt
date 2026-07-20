import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
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
    orderBy: (p, { desc: d }) => [d(p.publishedAt)],
  });

  if (publishedPosts.length === 0) return [];

  // Antes se leía la tabla ENTERA de métricas (todas las filas históricas de
  // todos los posts) y se filtraba en memoria — con la data creciendo eso se
  // volvía lentísimo y colgaba el panel (504). Ahora, con DISTINCT ON, la base
  // devuelve directamente UNA sola fila por post (la última), apoyada en el
  // índice (post_id, captured_at DESC). Instantáneo sin importar el tamaño.
  const latestMetrics = await db
    .selectDistinctOn([postMetrics.postId])
    .from(postMetrics)
    .where(inArray(postMetrics.postId, publishedPosts.map((p) => p.id)))
    .orderBy(postMetrics.postId, desc(postMetrics.capturedAt));

  const latest = new Map(latestMetrics.map((m) => [m.postId, m]));

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
