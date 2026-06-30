ALTER TABLE "ig_accounts" DROP COLUMN "fb_page_id";--> statement-breakpoint
ALTER TABLE "ig_accounts" DROP COLUMN "page_access_token_enc";--> statement-breakpoint
ALTER TABLE "ig_accounts" DROP COLUMN "user_access_token_enc";--> statement-breakpoint
ALTER TABLE "ig_accounts" ADD COLUMN "access_token_enc" text NOT NULL;
