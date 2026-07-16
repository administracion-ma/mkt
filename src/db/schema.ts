import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  doublePrecision,
  boolean,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";

export const mediaTypeEnum = pgEnum("media_type", ["IMAGE", "VIDEO", "REELS", "CAROUSEL_ALBUM"]);
export const postStatusEnum = pgEnum("post_status", [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
]);

// Estado interno de producción del video/pieza (previo a publicar) — calca la planilla de Coinbox
export const productionStatusEnum = pgEnum("production_status", [
  "SIN_INICIAR",
  "SIN_GRABAR",
  "PROCESO",
  "EDITADO",
  "A_REVISAR",
  "SUBIDO",
]);

// Canal/destino de distribución ("Detalle" en la planilla)
export const channelEnum = pgEnum("channel", [
  "SOLO_TIKTOK",
  "VERTICAL",
  "YOUTUBE",
  "PAUTA",
  "TODOS",
]);

export const formatEnum = pgEnum("format", ["VERTICAL", "HORIZONTAL"]);

export const youtubePrivacyEnum = pgEnum("youtube_privacy", ["public", "unlisted", "private"]);

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

export const editors = pgTable("editors", {
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
  videoDurationMs: integer("video_duration_ms"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: postStatusEnum("status").notNull().default("DRAFT"),
  igMediaId: text("ig_media_id"),
  igPermalink: text("ig_permalink"),
  publishError: text("publish_error"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  // Producción interna (planilla de Coinbox)
  productionStatus: productionStatusEnum("production_status"),
  channel: channelEnum("channel"),
  format: formatEnum("format"),
  editorId: integer("editor_id").references(() => editors.id),
  rawFootageUrl: text("raw_footage_url"),
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
  repostsCount: integer("reposts_count"),
  plays: integer("plays"),
  avgWatchTimeMs: integer("avg_watch_time_ms"),
  skipRate: doublePrecision("skip_rate"),
  profileLinkClicks: integer("profile_link_clicks"),
  totalInteractions: integer("total_interactions"),
  followsCount: integer("follows_count"),
  profileVisits: integer("profile_visits"),
  followersReach: integer("followers_reach"),
  nonFollowersReach: integer("non_followers_reach"),
});

// Snapshot diario de la cuenta (para gráficos de evolución)
export const accountMetrics = pgTable("account_metrics", {
  id: serial("id").primaryKey(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  followersCount: integer("followers_count"),
  mediaCount: integer("media_count"),
});

// Ficha de marca — texto libre editable desde /settings, se le manda a la IA
// como contexto de negocio para que las recomendaciones sean específicas.
export const brandProfile = pgTable("brand_profile", {
  id: serial("id").primaryKey(),
  content: text("content").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const analysisReports = pgTable("analysis_reports", {
  id: serial("id").primaryKey(),
  periodFrom: timestamp("period_from", { withTimezone: true }).notNull(),
  periodTo: timestamp("period_to", { withTimezone: true }).notNull(),
  summary: text("summary").notNull(),
  modelUsed: text("model_used").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Meta Ads (Marketing API) — solo lectura de métricas, nunca se crean/pausan
// campañas desde acá. Se conecta con un System User Token (ads_read), no OAuth.
export const adAccounts = pgTable("ad_accounts", {
  id: serial("id").primaryKey(),
  adAccountId: text("ad_account_id").notNull(), // "act_123456789"
  label: text("label"),
  currency: text("currency").notNull().default("USD"), // moneda de la cuenta (ISO 4217), ej. "PYG"
  accessTokenEnc: text("access_token_enc").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adCampaigns = pgTable("ad_campaigns", {
  id: serial("id").primaryKey(),
  campaignId: text("campaign_id").notNull().unique(), // ID de Meta
  name: text("name").notNull(),
  objective: text("objective"),
  status: text("status"),
  // Asignado a mano desde /ads — para cruzar gasto de pauta con rendimiento
  // orgánico del mismo pilar de contenido (sin esto, orgánico y pauta viven
  // en silos separados y no se puede responder "¿la plata en X empuja lo
  // que ya andaba bien?").
  pillarId: integer("pillar_id").references(() => pillars.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Un snapshot por campaña por día (desglose diario de la Marketing API)
export const adInsights = pgTable("ad_insights", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => adCampaigns.id),
  date: timestamp("date", { withTimezone: true }).notNull(),
  spend: doublePrecision("spend"),
  impressions: integer("impressions"),
  reach: integer("reach"),
  clicks: integer("clicks"),
  linkClicks: integer("link_clicks"),
  cpc: doublePrecision("cpc"),
  cpm: doublePrecision("cpm"),
  ctr: doublePrecision("ctr"),
  results: integer("results"), // suma de todas las "actions" que reporta Meta (leads, mensajes, compras, etc.)
  messages: integer("messages"), // subconjunto de actions: solo conversaciones/mensajes iniciados
  actions: jsonb("actions").$type<{ action_type: string; value: string }[]>(), // crudo, para poder sumar por tipo a futuro sin re-pedir historial
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
});

// Anuncio individual (creativo) — para poder ver rendimiento por pieza, no
// solo por campaña, y mostrar la miniatura/video real de cada uno.
export const ads = pgTable("ads", {
  id: serial("id").primaryKey(),
  adId: text("ad_id").notNull().unique(), // ID de Meta
  campaignId: integer("campaign_id").notNull().references(() => adCampaigns.id),
  name: text("name").notNull(),
  status: text("status"),
  creativeId: text("creative_id"),
  thumbnailUrl: text("thumbnail_url"),
  isVideo: boolean("is_video").notNull().default(false),
  metaCreatedAt: timestamp("meta_created_at", { withTimezone: true }), // fecha real de creación en Meta, no la nuestra de sync
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Snapshot diario por anuncio individual
export const adCreativeInsights = pgTable("ad_creative_insights", {
  id: serial("id").primaryKey(),
  adId: integer("ad_id").notNull().references(() => ads.id),
  date: timestamp("date", { withTimezone: true }).notNull(),
  spend: doublePrecision("spend"),
  impressions: integer("impressions"),
  reach: integer("reach"),
  clicks: integer("clicks"),
  linkClicks: integer("link_clicks"),
  cpc: doublePrecision("cpc"),
  cpm: doublePrecision("cpm"),
  ctr: doublePrecision("ctr"),
  frequency: doublePrecision("frequency"),
  results: integer("results"),
  messages: integer("messages"),
  actions: jsonb("actions").$type<{ action_type: string; value: string }[]>(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
});

// Carga manual de ventas — no hay forma de saberlo automático (Coinbox vende
// hardware de minería, no hay checkout/pixel acá), así que sin esto el gasto
// de pauta nunca conecta con la plata real que entró (ROAS de verdad, no solo
// costo por mensaje/lead). Mismo espíritu que las otras cargas manuales de la
// app (pilares, editores): liviano, vía web, no requiere integrar nada nuevo.
export const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  amountUsd: doublePrecision("amount_usd").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  note: text("note"),
  campaignId: integer("campaign_id").references(() => adCampaigns.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Informe de IA para pauta — mismo mecanismo de memoria que analysis_reports
// (Instagram orgánico): compara contra el informe anterior para hacer
// seguimiento explícito de si una recomendación se reflejó en los datos.
export const adAnalysisReports = pgTable("ad_analysis_reports", {
  id: serial("id").primaryKey(),
  periodFrom: timestamp("period_from", { withTimezone: true }).notNull(),
  periodTo: timestamp("period_to", { withTimezone: true }).notNull(),
  summary: text("summary").notNull(),
  modelUsed: text("model_used").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Las "🎯 ACCIONES PARA LA SEMANA" de cada informe (orgánico y ads) se
// extraen a filas propias en vez de quedar enterradas en el texto — así se
// pueden marcar como hechas/descartadas y se ven en un solo lugar (home)
// en vez de tener que abrir cada informe en Resúmenes para acordarse.
export const actionItems = pgTable("action_items", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(), // "organic" | "ads"
  text: text("text").notNull(),
  status: text("status").notNull().default("open"), // "open" | "done" | "dismissed"
  periodFrom: timestamp("period_from", { withTimezone: true }).notNull(),
  periodTo: timestamp("period_to", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

// YouTube (Data API v3 + Analytics API) — OAuth2 de Google, no Meta. El access
// token dura ~1h (a diferencia del token de 60 días de Meta), así que se
// refresca solo en cada uso (ver youtube/account-store.ts) en vez de por cron.
export const youtubeAccounts = pgTable("youtube_accounts", {
  id: serial("id").primaryKey(),
  channelId: text("channel_id").notNull(),
  channelTitle: text("channel_title").notNull(),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const youtubeVideos = pgTable("youtube_videos", {
  id: serial("id").primaryKey(),
  pillarId: integer("pillar_id").references(() => pillars.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  videoFileUrl: text("video_file_url").notNull(),
  privacyStatus: youtubePrivacyEnum("privacy_status").notNull().default("public"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: postStatusEnum("status").notNull().default("DRAFT"), // reusa el mismo enum que posts (IG)
  youtubeVideoId: text("youtube_video_id"),
  youtubeUrl: text("youtube_url"),
  publishError: text("publish_error"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  durationSec: integer("duration_sec"), // de contentDetails (Data API), se completa en el sync
  isShort: boolean("is_short"), // null = todavía no se chequeó; separa Shorts de videos largos
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Snapshot por video — igual que post_metrics, viene de YouTube Analytics API
// (views/likes/comments/retención), no de Data API (que solo da lo público).
export const youtubeVideoMetrics = pgTable("youtube_video_metrics", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").notNull().references(() => youtubeVideos.id),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  views: integer("views"),
  likes: integer("likes"),
  comments: integer("comments"),
  shares: integer("shares"),
  averageViewDurationSec: integer("average_view_duration_sec"),
  averageViewPercentage: doublePrecision("average_view_percentage"),
  subscribersGained: integer("subscribers_gained"),
});

// Snapshot diario del canal (suscriptores) — igual que account_metrics de IG.
export const youtubeChannelMetrics = pgTable("youtube_channel_metrics", {
  id: serial("id").primaryKey(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  subscriberCount: integer("subscriber_count"),
  viewCount: integer("view_count"),
});

// Metas del área — una sola fila, editable desde /settings. Sin metas los
// deltas son relativos ("subió 10%"); con metas el panel puede decir si vas
// bien o mal contra TU número, no contra la semana pasada.
export const marketingGoals = pgTable("marketing_goals", {
  id: serial("id").primaryKey(),
  monthlyAdBudgetUsd: doublePrecision("monthly_ad_budget_usd"),
  monthlySalesTargetUsd: doublePrecision("monthly_sales_target_usd"),
  weeklyPostsTarget: integer("weekly_posts_target"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
