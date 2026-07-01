import { sql } from "drizzle-orm";
import { db } from "../src/db/client";

async function main() {
  await db.execute(sql`
    ALTER TABLE post_metrics
      ADD COLUMN IF NOT EXISTS follows_count integer,
      ADD COLUMN IF NOT EXISTS profile_visits integer;
  `);
  console.log("Migration applied: follows_count, profile_visits added to post_metrics.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
