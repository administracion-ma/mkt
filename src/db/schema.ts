import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  doublePrecision,
  pgEnum,
} from "drizzle-orm/pg-core";

export const mediaTypeEnum = pgEnum("media_type", ["IMAGE", "VIDEO", "REELS"]);
export const postStatusEnum = pgEnum("post_status", [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
]);

export const igAccounts = pgTable("ig_accounts", {
  id: serial("id").primaryKey(),
  igUserId: text("ig_user_id").notNull(),
  igUsername: text("ig_username").notNull(),
  accessTokenEnc: text("access_token_enc").notNull(),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pillars = pgTable("pillars", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  pillarId: integer("pillar_id").notNull().references(() => pillars.id),
  caption: text("caption").notNull(),
  mediaType: mediaTypeEnum("media_type").notNull(),
  mediaUrl: text("media_url").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: postStatusEnum("status").notNull().default("DRAFT"),
  igMediaId: text("ig_media_id"),
  igPermalink: text("ig_permalink"),
  publishError: text("publish_error"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const postMetrics = pgTable("post_metrics", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => posts.id),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  reach: integer("reach"),
  impressions: integer("impressions"),
  likeCount: integer("like_count"),
  commentCount: integer("comment_count"),
  savedCount: integer("saved_count"),
  sharesCount: integer("shares_count"),
  videoViews: integer("video_views"),
  plays: integer("plays"),
  avgWatchTimeMs: integer("avg_watch_time_ms"),
  skipRate: doublePrecision("skip_rate"),
  profileLinkClicks: integer("profile_link_clicks"),
  totalInteractions: integer("total_interactions"),
});

export const analysisReports = pgTable("analysis_reports", {
  id: serial("id").primaryKey(),
  periodFrom: timestamp("period_from", { withTimezone: true }).notNull(),
  periodTo: timestamp("period_to", { withTimezone: true }).notNull(),
  summary: text("summary").notNull(),
  modelUsed: text("model_used").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
