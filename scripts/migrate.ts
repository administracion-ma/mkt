import { sql } from "drizzle-orm";
import { db } from "../src/db/client";

async function main() {
  await db.execute(sql`
    ALTER TABLE post_metrics
      ADD COLUMN IF NOT EXISTS follows_count integer,
      ADD COLUMN IF NOT EXISTS profile_visits integer;
  `);
  console.log("Migration applied: follows_count, profile_visits.");

  await db.execute(sql`
    ALTER TABLE post_metrics
      ADD COLUMN IF NOT EXISTS reposts_count integer,
      ADD COLUMN IF NOT EXISTS followers_reach integer,
      ADD COLUMN IF NOT EXISTS non_followers_reach integer;
  `);
  console.log("Migration applied: reposts_count, followers_reach, non_followers_reach.");

  await db.execute(sql`
    ALTER TABLE posts
      ADD COLUMN IF NOT EXISTS video_duration_ms integer;
  `);
  console.log("Migration applied: video_duration_ms on posts.");

  // Add CAROUSEL_ALBUM to the media_type enum (idempotent via DO block)
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'CAROUSEL_ALBUM'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'media_type')
      ) THEN
        ALTER TYPE media_type ADD VALUE 'CAROUSEL_ALBUM';
      END IF;
    END$$;
  `);
  console.log("Migration applied: CAROUSEL_ALBUM added to media_type enum.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
