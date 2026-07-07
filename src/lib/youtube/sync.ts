import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { youtubeVideos, youtubeVideoMetrics, youtubeChannelMetrics } from "@/db/schema";
import { getVideoAnalytics, getChannelSummary } from "@/lib/youtube/api";

type YoutubeVideo = typeof youtubeVideos.$inferSelect;
type Account = { channelId: string; accessToken: string };

// Sincroniza las métricas de un video publicado — un snapshot por día, igual
// que instagram/sync.ts::syncPostInsights.
export async function syncVideoInsights(video: YoutubeVideo, account: Account): Promise<boolean> {
  if (!video.youtubeVideoId || !video.publishedAt) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const startDate = video.publishedAt.toISOString().slice(0, 10);
  const endDate = today.toISOString().slice(0, 10);

  const insights = await getVideoAnalytics(account.accessToken, account.channelId, video.youtubeVideoId, startDate, endDate);

  const metricsData = {
    views: insights.views ?? null,
    likes: insights.likes ?? null,
    comments: insights.comments ?? null,
    shares: insights.shares ?? null,
    averageViewDurationSec: insights.averageViewDurationSec ?? null,
    averageViewPercentage: insights.averageViewPercentage ?? null,
    subscribersGained: insights.subscribersGained ?? null,
    capturedAt: new Date(),
  };

  const hasData = Object.entries(metricsData).some(([k, v]) => k !== "capturedAt" && v != null);
  if (!hasData) return false;

  const existingToday = await db.query.youtubeVideoMetrics.findFirst({
    where: and(
      eq(youtubeVideoMetrics.videoId, video.id),
      gte(youtubeVideoMetrics.capturedAt, today),
      lt(youtubeVideoMetrics.capturedAt, tomorrow)
    ),
  });

  if (existingToday) {
    const nonNullUpdate = Object.fromEntries(Object.entries(metricsData).filter(([, v]) => v != null));
    await db.update(youtubeVideoMetrics).set(nonNullUpdate).where(eq(youtubeVideoMetrics.id, existingToday.id));
  } else {
    await db.insert(youtubeVideoMetrics).values({ videoId: video.id, ...metricsData });
  }

  return true;
}

// Snapshot diario del canal (suscriptores/vistas totales) — igual que
// instagram/sync.ts::snapshotAccount.
export async function snapshotChannel(account: Account): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const summary = await getChannelSummary(account.accessToken, account.channelId);

  const existingToday = await db.query.youtubeChannelMetrics.findFirst({
    where: and(gte(youtubeChannelMetrics.capturedAt, today), lt(youtubeChannelMetrics.capturedAt, tomorrow)),
  });

  if (existingToday) {
    await db
      .update(youtubeChannelMetrics)
      .set({ subscriberCount: summary.subscriberCount, viewCount: summary.viewCount, capturedAt: new Date() })
      .where(eq(youtubeChannelMetrics.id, existingToday.id));
  } else {
    await db.insert(youtubeChannelMetrics).values({ subscriberCount: summary.subscriberCount, viewCount: summary.viewCount });
  }
}
