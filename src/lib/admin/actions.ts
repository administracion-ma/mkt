"use server";

import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { classifyImportedPosts, fixMisclassifiedGraphics } from "@/lib/pillars/classify";

export async function runMigration(): Promise<{ ok: boolean; message: string }> {
  try {
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

    return { ok: true, message: "Migración aplicada correctamente: tablas, columnas y pilares/editores listos." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error desconocido" };
  }
}

export async function runClassification(): Promise<{ ok: boolean; message: string }> {
  try {
    const logs: string[] = [];
    const result = await classifyImportedPosts((msg) => logs.push(msg));
    return {
      ok: true,
      message: `${result.reclassified} de ${result.total} posts asignados a un pilar real. ${result.movedToFallback} sin tema claro (quedaron en Importado).\n\n${logs.join("\n")}`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error desconocido" };
  }
}

export async function runFixGraphics(): Promise<{ ok: boolean; message: string }> {
  try {
    const logs: string[] = [];
    const result = await fixMisclassifiedGraphics((msg) => logs.push(msg));
    return {
      ok: true,
      message: `${result.total} reel(s)/video(s) sacados de Post gráfico: ${result.reclassified} a un pilar real, ${result.movedToFallback} a Importado (sin tema claro).\n\n${logs.join("\n")}`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error desconocido" };
  }
}
