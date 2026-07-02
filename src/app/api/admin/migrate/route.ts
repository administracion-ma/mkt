import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Migraciones idempotentes (mismas que scripts/migrate.ts).
// Protegida: requiere el header x-admin-key igual a TOKEN_ENCRYPTION_KEY.
export async function POST(request: NextRequest) {
  const key = request.headers.get("x-admin-key");
  if (!key || key !== env.tokenEncryptionKey) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

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

  return NextResponse.json({
    ok: true,
    applied: ["account_metrics", "analysis_reports", "production_status/channel/format/editors on posts", "seed pilares+editores"],
  });
}
