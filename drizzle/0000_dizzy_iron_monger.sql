CREATE TYPE "public"."media_type" AS ENUM('IMAGE', 'VIDEO', 'REELS');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED');--> statement-breakpoint
CREATE TABLE "analysis_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_from" timestamp with time zone NOT NULL,
	"period_to" timestamp with time zone NOT NULL,
	"summary" text NOT NULL,
	"model_used" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ig_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"ig_user_id" text NOT NULL,
	"ig_username" text NOT NULL,
	"fb_page_id" text NOT NULL,
	"page_access_token_enc" text NOT NULL,
	"user_access_token_enc" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pillars" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "pillars_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "post_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reach" integer,
	"impressions" integer,
	"like_count" integer,
	"comment_count" integer,
	"saved_count" integer,
	"shares_count" integer,
	"video_views" integer,
	"plays" integer,
	"avg_watch_time_ms" integer,
	"skip_rate" double precision,
	"profile_link_clicks" integer,
	"total_interactions" integer
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"pillar_id" integer NOT NULL,
	"caption" text NOT NULL,
	"media_type" "media_type" NOT NULL,
	"media_url" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "post_status" DEFAULT 'DRAFT' NOT NULL,
	"ig_media_id" text,
	"ig_permalink" text,
	"publish_error" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_metrics" ADD CONSTRAINT "post_metrics_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_pillar_id_pillars_id_fk" FOREIGN KEY ("pillar_id") REFERENCES "public"."pillars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "pillars" ("key", "label") VALUES
	('tecnico_specs', 'Técnico / Specs'),
	('roi_numeros', 'ROI / Números'),
	('caso_exito', 'Caso de éxito'),
	('detras_de_escena', 'Detrás de escena');