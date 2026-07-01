import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { posts, postMetrics, accountMetrics } from "@/db/schema";
import {
  getAccountSummary,
  getMediaInsights,
  graphGetMediaDuration,
} from "@/lib/instagram/graph-api";

type PublishedPost = typeof posts.$inferSelect;
type Account = { igUserId: string; accessToken: string };

// Sincroniza las métricas de un post publicado. Un snapshot por día:
// si ya existe uno de hoy lo actualiza (sin pisar datos buenos con null).
export async function syncPostInsights(post: PublishedPost, account: Account): Promise<boolean> {
  if (!post.igMediaId) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const insights = await getMediaInsights(
    post.igMediaId,
    account.accessToken,
    post.mediaType as "IMAGE" | "VIDEO" | "REELS" | "CAROUSEL_ALBUM"
  );

  const metricsData = {
    reach: insights.reach ?? null,
    impressions: insights.impressions ?? null,
    likeCount: insights.likeCount ?? null,
    commentCount: insights.commentCount ?? null,
    savedCount: insights.savedCount ?? null,
    sharesCount: insights.sharesCount ?? null,
    repostsCount: insights.repostsCount ?? null,
    plays: insights.plays ?? null,
    totalInteractions: insights.totalInteractions ?? null,
    avgWatchTimeMs: insights.avgWatchTimeMs ?? null,
    skipRate: insights.skipRate ?? null,
    followsCount: insights.followsCount ?? null,
    profileVisits: insights.profileVisits ?? null,
    followersReach: insights.followersReach ?? null,
    nonFollowersReach: insights.nonFollowersReach ?? null,
    capturedAt: new Date(),
  };

  // Si la API no devolvió nada útil, no tocar la BD (preserva datos anteriores)
  const hasData = Object.entries(metricsData).some(([k, v]) => k !== "capturedAt" && v != null);
  if (!hasData) return false;

  const existingToday = await db.query.postMetrics.findFirst({
    where: and(
      eq(postMetrics.postId, post.id),
      gte(postMetrics.capturedAt, today),
      lt(postMetrics.capturedAt, tomorrow)
    ),
  });

  if (existingToday) {
    // Solo actualizar campos con valor real — nunca pisar buenos datos con null
    const nonNullUpdate = Object.fromEntries(
      Object.entries(metricsData).filter(([, v]) => v != null)
    );
    await db.update(postMetrics).set(nonNullUpdate).where(eq(postMetrics.id, existingToday.id));
  } else {
    await db.insert(postMetrics).values({ postId: post.id, ...metricsData });
  }

  // Fill video duration if missing (needed for retention curve)
  if (post.videoDurationMs == null && (post.mediaType === "VIDEO" || post.mediaType === "REELS")) {
    try {
      const durationMs = await graphGetMediaDuration(post.igMediaId, account.accessToken);
      if (durationMs != null) {
        await db.update(posts).set({ videoDurationMs: durationMs }).where(eq(posts.id, post.id));
      }
    } catch {
      // not critical
    }
  }

  return true;
}

// Snapshot diario de la cuenta (seguidores) para el gráfico de evolución.
export async function snapshotAccount(account: Account): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const summary = await getAccountSummary(account.igUserId, account.accessToken);

  const existingToday = await db.query.accountMetrics.findFirst({
    where: and(gte(accountMetrics.capturedAt, today), lt(accountMetrics.capturedAt, tomorrow)),
  });

  if (existingToday) {
    await db
      .update(accountMetrics)
      .set({ followersCount: summary.followersCount, mediaCount: summary.mediaCount, capturedAt: new Date() })
      .where(eq(accountMetrics.id, existingToday.id));
  } else {
    await db.insert(accountMetrics).values({
      followersCount: summary.followersCount,
      mediaCount: summary.mediaCount,
    });
  }
}
