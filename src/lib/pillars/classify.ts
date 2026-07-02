import { and, eq, inArray, notInArray } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db/client";
import { posts, pillars } from "@/db/schema";
import { env } from "@/lib/env";

const MODEL = "claude-opus-4-8";
const BATCH_SIZE = 50;

// Los 8 pilares reales de Coinbox — cualquier post en un pilar que NO sea
// uno de estos (sea cual sea su nombre: "importado", "default", etc.) es
// candidato a reclasificar.
const REAL_PILLAR_KEYS = ["labitconf", "granja", "dallas", "tutorial", "oficina", "garza", "taller", "post-grafico"];
const ALL_KEYS = [...REAL_PILLAR_KEYS, "importado"] as const;

const SYSTEM_PROMPT = `Clasificás posts de Instagram de Coinbox Mining (venta y hosting de equipos de minería de criptomonedas) en un pilar de contenido, según el caption y el tipo de post.

Pilares disponibles:
- labitconf: contenido relacionado a la conferencia/evento Labitconf
- granja: contenido sobre la granja/farm de minería (instalaciones, equipos funcionando)
- dallas: contenido relacionado a la sede/operación de Dallas
- tutorial: tutoriales, explicaciones técnicas, contenido educativo
- oficina: contenido de oficina, equipo de trabajo, cultura de empresa
- garza: contenido relacionado a "Garza" (evento, sede o proyecto puntual)
- taller: contenido de taller, reparación o service de equipos
- post-grafico: SOLO para posts de tipo IMAGE o CAROUSEL_ALBUM (diseño gráfico estático: anuncios, precios, promociones). NUNCA uses este pilar para un post de tipo REELS o VIDEO, sea cual sea el texto — un reel/video promocional va en el pilar de tema más cercano (ej. tutorial, granja) o en "importado" si no hay tema claro.
- importado: usalo si el caption no da ninguna pista razonable, o si es un REELS/VIDEO puramente promocional sin tema claro (no lo mandes a post-grafico solo porque el texto es de venta)

Reglas: basate en el texto del caption Y en el tipo de post (mediaType). Si menciona un lugar/evento específico de la lista, priorizalo. "post-grafico" es un pilar de FORMATO (imagen fija), no de tema — jamás lo asignes a un REELS o VIDEO.`;

function schemaFor(keys: readonly string[]) {
  return {
    type: "object",
    properties: {
      classifications: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "integer" },
            pillarKey: { type: "string", enum: keys },
          },
          required: ["id", "pillarKey"],
          additionalProperties: false,
        },
      },
    },
    required: ["classifications"],
    additionalProperties: false,
  } as const;
}

type TargetPost = { id: number; caption: string | null; mediaType: string };

async function ensureFallbackPillar(log: (msg: string) => void) {
  let allPillars = await db.query.pillars.findMany();
  let importado = allPillars.find((p) => p.key === "importado");
  if (!importado) {
    const [created] = await db.insert(pillars).values({ key: "importado", label: "Importado de Instagram" }).returning();
    importado = created;
    allPillars = await db.query.pillars.findMany();
    log("Creado pilar de respaldo 'Importado de Instagram'.");
  }
  return { allPillars, importado };
}

async function runClassification(
  targets: TargetPost[],
  allowedKeys: readonly string[],
  allPillars: { id: number; key: string; label: string }[],
  importadoId: number,
  log: (msg: string) => void
): Promise<{ reclassified: number; movedToFallback: number }> {
  if (targets.length === 0) return { reclassified: 0, movedToFallback: 0 };

  const pillarByKey = new Map(allPillars.map((p) => [p.key, p.id]));
  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const schema = schemaFor(allowedKeys);
  let reclassified = 0;
  let movedToFallback = 0;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    log(`Lote ${Math.floor(i / BATCH_SIZE) + 1}: posts ${i + 1}-${i + batch.length}`);

    const list = batch.map((p) => ({
      id: p.id,
      mediaType: p.mediaType,
      caption: (p.caption || "(sin caption)").slice(0, 200),
    }));

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: `Clasificá estos posts:\n\n${JSON.stringify(list, null, 1)}` }],
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock) {
      log("Sin respuesta del modelo, salteando lote.");
      continue;
    }

    let parsed: { classifications: { id: number; pillarKey: string }[] };
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      log("No se pudo parsear la respuesta, salteando lote.");
      continue;
    }

    const idsByPillar = new Map<number, number[]>();
    for (const c of parsed.classifications) {
      const pillarId = pillarByKey.get(c.pillarKey);
      if (!pillarId) continue;
      (idsByPillar.get(pillarId) ?? idsByPillar.set(pillarId, []).get(pillarId)!).push(c.id);
    }

    for (const [pillarId, ids] of idsByPillar) {
      await db.update(posts).set({ pillarId }).where(inArray(posts.id, ids));
      const label = allPillars.find((p) => p.id === pillarId)?.label;
      if (pillarId === importadoId) {
        movedToFallback += ids.length;
        log(`${ids.length} post(s) -> ${label} (sin tema claro)`);
      } else {
        reclassified += ids.length;
        log(`${ids.length} post(s) -> ${label}`);
      }
    }
  }

  return { reclassified, movedToFallback };
}

export async function classifyImportedPosts(
  log: (msg: string) => void = () => {}
): Promise<{ reclassified: number; movedToFallback: number; total: number }> {
  const { allPillars, importado } = await ensureFallbackPillar(log);
  const realPillarIds = allPillars.filter((p) => REAL_PILLAR_KEYS.includes(p.key)).map((p) => p.id);

  // Cualquier post que no esté ya en uno de los 8 pilares reales es candidato,
  // sea cual sea el pilar en el que haya quedado (no asumimos el nombre).
  const targets =
    realPillarIds.length > 0
      ? await db.query.posts.findMany({
          where: notInArray(posts.pillarId, realPillarIds),
          columns: { id: true, caption: true, mediaType: true },
        })
      : await db.query.posts.findMany({ columns: { id: true, caption: true, mediaType: true } });

  if (targets.length === 0) {
    log("No hay posts para reclasificar — todos ya están en un pilar real.");
    return { reclassified: 0, movedToFallback: 0, total: 0 };
  }
  log(`Reclasificando ${targets.length} post(s)...`);

  const { reclassified, movedToFallback } = await runClassification(targets, ALL_KEYS, allPillars, importado.id, log);
  return { reclassified, movedToFallback, total: targets.length };
}

// Corrige reels/videos que hayan quedado mal etiquetados como "post-grafico"
// (pilar de formato, exclusivo para imágenes/carruseles).
export async function fixMisclassifiedGraphics(
  log: (msg: string) => void = () => {}
): Promise<{ reclassified: number; movedToFallback: number; total: number }> {
  const { allPillars, importado } = await ensureFallbackPillar(log);
  const postGrafico = allPillars.find((p) => p.key === "post-grafico");
  if (!postGrafico) {
    log("No existe el pilar 'post-grafico'.");
    return { reclassified: 0, movedToFallback: 0, total: 0 };
  }

  const targets = await db.query.posts.findMany({
    where: and(eq(posts.pillarId, postGrafico.id), inArray(posts.mediaType, ["REELS", "VIDEO"])),
    columns: { id: true, caption: true, mediaType: true },
  });

  if (targets.length === 0) {
    log("No hay reels/videos mal etiquetados como 'post-grafico'.");
    return { reclassified: 0, movedToFallback: 0, total: 0 };
  }
  log(`Corrigiendo ${targets.length} reel(s)/video(s) etiquetados como 'post-grafico'...`);

  // Sin "post-grafico" como opción — obligamos a elegir un pilar de tema real o "importado"
  const allowedKeys = ALL_KEYS.filter((k) => k !== "post-grafico");
  const { reclassified, movedToFallback } = await runClassification(targets, allowedKeys, allPillars, importado.id, log);
  return { reclassified, movedToFallback, total: targets.length };
}
