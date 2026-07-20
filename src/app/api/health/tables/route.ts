import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

// Diagnóstico de tamaño e índices de las tablas de métricas. Responde:
//  - filas estimadas por tabla (pg_class.reltuples, instantáneo)
//  - qué índices existen hoy en post_metrics y youtube_channel_metrics
// Sirve para saber con certeza si la migración creó los índices y si alguna
// tabla creció de forma anormal (posible bug de sync insertando de más).
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  try {
    const counts = await db.execute(sql`
      SELECT relname AS tabla, reltuples::bigint AS filas_estimadas
      FROM pg_class
      WHERE relname IN ('post_metrics','youtube_channel_metrics','account_metrics','youtube_video_metrics')
      ORDER BY reltuples DESC
    `);
    const indexes = await db.execute(sql`
      SELECT tablename AS tabla, indexname AS indice
      FROM pg_indexes
      WHERE tablename IN ('post_metrics','youtube_channel_metrics','account_metrics','youtube_video_metrics')
      ORDER BY tablename, indexname
    `);
    return NextResponse.json({ counts, indexes });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
