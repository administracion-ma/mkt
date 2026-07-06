import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { BRAND_PROFILE_DRAFT } from "@/lib/brand/draft";

// Migraciones idempotentes — seguro correr varias veces. Usado tanto por
// scripts/migrate.ts como por /admin (server action) y la ruta legacy.
export async function applyMigration(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS account_metrics (
      id serial PRIMARY KEY,
      captured_at timestamptz NOT NULL DEFAULT now(),
      followers_count integer,
      media_count integer
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS analysis_reports (
      id serial PRIMARY KEY,
      period_from timestamptz NOT NULL,
      period_to timestamptz NOT NULL,
      summary text NOT NULL,
      model_used text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

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

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS brand_profile (
      id serial PRIMARY KEY,
      content text NOT NULL DEFAULT '',
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`
    INSERT INTO brand_profile (content)
    SELECT ${BRAND_PROFILE_DRAFT}
    WHERE NOT EXISTS (SELECT 1 FROM brand_profile);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ad_accounts (
      id serial PRIMARY KEY,
      ad_account_id text NOT NULL,
      label text,
      access_token_enc text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ad_campaigns (
      id serial PRIMARY KEY,
      campaign_id text NOT NULL UNIQUE,
      name text NOT NULL,
      objective text,
      status text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS pillar_id integer REFERENCES pillars(id);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ad_insights (
      id serial PRIMARY KEY,
      campaign_id integer NOT NULL REFERENCES ad_campaigns(id),
      date timestamptz NOT NULL,
      spend double precision,
      impressions integer,
      reach integer,
      clicks integer,
      link_clicks integer,
      cpc double precision,
      cpm double precision,
      ctr double precision,
      results integer,
      captured_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(campaign_id, date)
    );
  `);

  await db.execute(sql`
    ALTER TABLE ad_insights
      ADD COLUMN IF NOT EXISTS messages integer,
      ADD COLUMN IF NOT EXISTS actions jsonb;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ads (
      id serial PRIMARY KEY,
      ad_id text NOT NULL UNIQUE,
      campaign_id integer NOT NULL REFERENCES ad_campaigns(id),
      name text NOT NULL,
      status text,
      creative_id text,
      thumbnail_url text,
      is_video boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    ALTER TABLE ads ADD COLUMN IF NOT EXISTS meta_created_at timestamptz;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ad_creative_insights (
      id serial PRIMARY KEY,
      ad_id integer NOT NULL REFERENCES ads(id),
      date timestamptz NOT NULL,
      spend double precision,
      impressions integer,
      reach integer,
      clicks integer,
      link_clicks integer,
      cpc double precision,
      cpm double precision,
      ctr double precision,
      frequency double precision,
      results integer,
      captured_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(ad_id, date)
    );
  `);

  await db.execute(sql`
    ALTER TABLE ad_creative_insights
      ADD COLUMN IF NOT EXISTS messages integer,
      ADD COLUMN IF NOT EXISTS actions jsonb;
  `);
}
