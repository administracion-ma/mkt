import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "../src/db/client";
import { posts, postMetrics } from "../src/db/schema";
import { getConnectedAccount } from "../src/lib/instagram/account-store";
import { getMediaInsights } from "../src/lib/instagram/graph-api";

async function main() {
  const account = await getConnectedAccount();
  if (!account) {
    console.log("No hay ninguna cuenta de Instagram conectada.");
    return;
  }

  const publishedPosts = await db.query.posts.findMany({
    where: eq(posts.status, "PUBLISHED"),
  });

  const withMedia = publishedPosts.filter((p) => p.igMediaId);
  if (withMedia.length === 0) {
    console.log("No hay posts publicados con media ID.");
    return;
  }

  console.log(`Sincronizando métricas de ${withMedia.length} post(s)...`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  for (const post of withMedia) {
    console.log(`-> Post #${post.id} (${post.igMediaId})`);
    try {
      const insights = await getMediaInsights(
        post.igMediaId!,
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

      const existingToday = await db.query.postMetrics.findFirst({
        where: and(
          eq(postMetrics.postId, post.id),
          gte(postMetrics.capturedAt, today),
          lt(postMetrics.capturedAt, tomorrow)
        ),
      });

      if (existingToday) {
        await db.update(postMetrics).set(metricsData).where(eq(postMetrics.id, existingToday.id));
      } else {
        await db.insert(postMetrics).values({ postId: post.id, ...metricsData });
      }

      console.log(
        `   OK reach=${insights.reach ?? "—"} views=${insights.plays ?? "—"} likes=${insights.likeCount ?? "—"} guard=${insights.savedCount ?? "—"} reposts=${insights.repostsCount ?? "—"} seg=${insights.followersReach ?? "—"} noSeg=${insights.nonFollowersReach ?? "—"} avgWatch=${insights.avgWatchTimeMs != null ? `${(insights.avgWatchTimeMs / 1000).toFixed(1)}s` : "—"} skip=${insights.skipRate ?? "—"}%`
      );
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
