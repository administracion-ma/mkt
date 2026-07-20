import { NextResponse } from "next/server";
import { desc, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { postMetrics } from "@/db/schema";

// Corre "analyticsRows" y "ytChannelMetrics" UNA POR VEZ, sin ninguna otra
// consulta concurrente, cada una con su propio cronómetro. El diagnóstico
// anterior (/api/health/home) las corría junto a otras 12 consultas en
// paralelo sobre el mismo pool de 5 conexiones — esto separa "se cuelgan
// solo bajo concurrencia" de "están rotas incluso solas".
export const dynamic = "force-dynamic";
export const maxDuration = 40;

async function timed<T>(label: string, fn: () => Promise<T>): Promise<[string, string]> {
  const start = Date.now();
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT>15s")), 15000)),
    ]);
    return [label, `${Date.now() - start}ms`];
  } catch (e) {
    return [label, `ERROR (${Date.now() - start}ms): ${e instanceof Error ? e.message : String(e)}`];
  }
}

export async function GET() {
  // Paso 1: ytChannelMetrics sola, nada más corriendo.
  const r1 = await timed("ytChannelMetrics_solo", () =>
    db.query.youtubeChannelMetrics.findMany({ orderBy: (m, { desc: d }) => [d(m.capturedAt)], limit: 400 }),
  );

  // Paso 2: el primer sub-paso de getAnalyticsRows (solo posts), solo.
  const r2 = await timed("posts_published_solo", () =>
    db.query.posts.findMany({ orderBy: (p, { desc: d }) => [d(p.publishedAt)] }),
  );

  // Paso 3: el segundo sub-paso (el DISTINCT ON), solo — usando ids reales si
  // el paso 2 trajo alguno, si no con un array vacío (igual debe responder rápido).
  const publishedIds =
    r2[1].startsWith("ERROR")
      ? []
      : await db.query.posts.findMany({ columns: { id: true } }).then((rows) => rows.map((r) => r.id));

  const r3 = await timed("distinctOn_solo", () =>
    publishedIds.length === 0
      ? Promise.resolve([])
      : db
          .selectDistinctOn([postMetrics.postId])
          .from(postMetrics)
          .where(inArray(postMetrics.postId, publishedIds))
          .orderBy(postMetrics.postId, desc(postMetrics.capturedAt)),
  );

  return NextResponse.json(Object.fromEntries([r1, r2, r3]));
}
