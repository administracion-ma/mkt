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

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS account_metrics (
      id serial PRIMARY KEY,
      captured_at timestamptz NOT NULL DEFAULT now(),
      followers_count integer,
      media_count integer
    );
  `);
  console.log("Migration applied: account_metrics table.");

  // Campos de producción interna (planilla de Coinbox)
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'production_status') THEN
        CREATE TYPE production_status AS ENUM ('SIN_INICIAR', 'SIN_GRABAR', 'PROCESO', 'EDITADO', 'A_REVISAR', 'SUBIDO');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'channel') THEN
        CREATE TYPE channel AS ENUM ('SOLO_TIKTOK', 'VERTICAL', 'YOUTUBE', 'PAUTA', 'TODOS');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'format') THEN
        CREATE TYPE format AS ENUM ('VERTICAL', 'HORIZONTAL');
      END IF;
    END$$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS editors (
      id serial PRIMARY KEY,
      key text NOT NULL UNIQUE,
      label text NOT NULL
    );
  `);

  await db.execute(sql`
    ALTER TABLE posts
      ADD COLUMN IF NOT EXISTS production_status production_status,
      ADD COLUMN IF NOT EXISTS channel channel,
      ADD COLUMN IF NOT EXISTS format format,
      ADD COLUMN IF NOT EXISTS editor_id integer REFERENCES editors(id),
      ADD COLUMN IF NOT EXISTS raw_footage_url text;
  `);
  console.log("Migration applied: producción interna (production_status, channel, format, editor, raw_footage_url).");

  await db.execute(sql`
    INSERT INTO pillars (key, label) VALUES
      ('labitconf', 'Labitconf'),
      ('granja', 'Granja'),
      ('dallas', 'Dallas'),
      ('tutorial', 'Tutorial'),
      ('oficina', 'Oficina'),
      ('garza', 'GARZA'),
      ('taller', 'Taller'),
      ('post-grafico', 'Post gráfico')
    ON CONFLICT (key) DO NOTHING;
  `);

  await db.execute(sql`
    INSERT INTO editors (key, label) VALUES
      ('colo', 'Colo'),
      ('male', 'Male'),
      ('pedro', 'Pedro'),
      ('thomas', 'Thomas'),
      ('nano', 'nano')
    ON CONFLICT (key) DO NOTHING;
  `);
  console.log("Migration applied: seed de pilares y editores de Coinbox.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
