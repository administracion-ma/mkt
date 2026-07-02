import { inArray, notInArray } from "drizzle-orm";
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

const SYSTEM_PROMPT = `Clasificás posts de Instagram de Coinbox Mining (venta y hosting de equipos de minería de criptomonedas) en un pilar de contenido, según el caption.

Pilares disponibles:
- labitconf: contenido relacionado a la conferencia/evento Labitconf
- granja: contenido sobre la granja/farm de minería (instalaciones, equipos funcionando)
- dallas: contenido relacionado a la sede/operación de Dallas
- tutorial: tutoriales, explicaciones técnicas, contenido educativo
- oficina: contenido de oficina, equipo de trabajo, cultura de empresa
- garza: contenido relacionado a "Garza" (evento, sede o proyecto puntual)
- taller: contenido de taller, reparación o service de equipos
- post-grafico: posts gráficos/diseño sin ser un evento o lugar específico (anuncios, precios, promociones en formato imagen)
- importado: usalo SOLO si el caption no da ninguna pista razonable de a cuál de los anteriores pertenece

Reglas: basate en el texto del caption. Si menciona un lugar/evento específico de la lista, priorizalo. Si es puramente promocional/gráfico sin contexto de lugar, usá post-grafico. Si no hay caption o es ambiguo, usá importado.`;

const SCHEMA = {
  type: "object",
  properties: {
    classifications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          pillarKey: {
            type: "string",
            enum: ["labitconf", "granja", "dallas", "tutorial", "oficina", "garza", "taller", "post-grafico", "importado"],
          },
        },
        required: ["id", "pillarKey"],
        additionalProperties: false,
      },
    },
  },
  required: ["classifications"],
  additionalProperties: false,
} as const;

export async function classifyImportedPosts(log: (msg: string) => void = () => {}): Promise<{ reclassified: number; total: number }> {
  let allPillars = await db.query.pillars.findMany();
  let importado = allPillars.find((p) => p.key === "importado");
  if (!importado) {
    // Fallback para posts que la IA no logre clasificar con confianza
    const [created] = await db.insert(pillars).values({ key: "importado", label: "Importado de Instagram" }).returning();
    importado = created;
    allPillars = await db.query.pillars.findMany();
    log("Creado pilar de respaldo 'Importado de Instagram'.");
  }

  const realPillarIds = allPillars.filter((p) => REAL_PILLAR_KEYS.includes(p.key)).map((p) => p.id);
  const pillarByKey = new Map(allPillars.map((p) => [p.key, p.id]));

  // Cualquier post que no esté ya en uno de los 8 pilares reales es candidato,
  // sea cual sea el pilar en el que haya quedado (no asumimos el nombre).
  const targets =
    realPillarIds.length > 0
      ? await db.query.posts.findMany({
          where: notInArray(posts.pillarId, realPillarIds),
          columns: { id: true, caption: true },
        })
      : await db.query.posts.findMany({ columns: { id: true, caption: true } });

  if (targets.length === 0) {
    log("No hay posts para reclasificar — todos ya están en un pilar real.");
    return { reclassified: 0, total: 0 };
  }
  log(`Reclasificando ${targets.length} post(s)...`);

  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  let reclassified = 0;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    log(`Lote ${i / BATCH_SIZE + 1}: posts ${i + 1}-${i + batch.length}`);

    const list = batch.map((p) => ({ id: p.id, caption: (p.caption || "(sin caption)").slice(0, 200) }));

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
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
      if (pillarId === importado.id) continue;
      await db.update(posts).set({ pillarId }).where(inArray(posts.id, ids));
      reclassified += ids.length;
      const label = allPillars.find((p) => p.id === pillarId)?.label;
      log(`${ids.length} post(s) -> ${label}`);
    }
  }

  return { reclassified, total: targets.length };
}
