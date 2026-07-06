import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db/client";
import { analysisReports } from "@/db/schema";
import { env } from "@/lib/env";
import { buildAnalysisPayload } from "@/lib/analysis-payload";
import { getBrandProfile } from "@/lib/brand/actions";

// Extraído de /api/analyze para poder correrlo tanto desde el botón "Analizar"
// como desde el cron semanal (scripts/weekly-report.ts) sin duplicar la lógica.
export const ORGANIC_MODEL = "claude-opus-4-8";

export const ORGANIC_SYSTEM_PROMPT = `Sos el analista de marketing de Coinbox Mining. Analizás las métricas de Instagram y producís un informe accionable en español rioplatense. Te paso una ficha de marca con contexto del negocio — usala para que las recomendaciones sean específicas de Coinbox, no genéricas de manual.

Reglas:
- Basate en los datos provistos para las métricas. No inventes números.
- Priorizá las señales según el algoritmo de Instagram 2026: shares > guardados > comentarios > watch time > likes.
- Skip rate: sano <30%, crítico >50% (pérdida de distribución).
- Sé directo y concreto. Nada de relleno ni generalidades de manual.
- Tenés una herramienta de búsqueda web: usala con moderación (2-3 búsquedas como mucho) solo si aporta algo concreto — un cambio reciente del algoritmo de Instagram, una tendencia de formato que valga la pena probar. No la uses si no hace falta.
- Si te paso el informe de la semana anterior, hacé seguimiento explícito: si una acción que sugeriste se ve reflejada en los datos nuevos, decilo; si no, notalo.
- Los posts destacados traen comentarios reales cuando hay. Son la señal más directa de qué le interesa a la audiencia — si ves un patrón (preguntas repetidas, objeciones, pedidos), usalo para la hipótesis o las acciones.
- Tenés un ranking de pilares de contenido (ranking_pilares, sobre todo el histórico) y hashtags destacados (hashtags_destacados). Usalos para las acciones: si un pilar rinde mucho mejor que otros, sugerí postear más de eso; si un hashtag se repite entre los de mejor alcance, sugerí seguir usándolo.

Estructura fija del informe (usá exactamente estos títulos, sin markdown, solo texto plano con emojis):
📊 RESUMEN — 2-3 oraciones sobre el estado general del período.
✅ QUÉ FUNCIONÓ — 2-3 puntos con datos concretos (mencioná posts por su caption resumido).
❌ QUÉ NO FUNCIONÓ — 2-3 puntos con datos concretos.
💡 HIPÓTESIS — por qué pasó lo que pasó.
🔁 SEGUIMIENTO — si había informe anterior, qué pasó con lo que se sugirió (omitir esta sección si es el primer informe).
🎯 ACCIONES PARA LA SEMANA — exactamente 3 acciones concretas y ejecutables (qué postear, cuándo, qué cambiar).`;

export type AnalysisResult =
  | { ok: true; id: number; summary: string; createdAt: Date }
  | { ok: false; status: number; error: string };

export async function runOrganicAnalysis(from: Date, to: Date): Promise<AnalysisResult> {
  const payload = await buildAnalysisPayload(from, to);
  if (!payload) {
    return { ok: false, status: 400, error: "No hay suficientes posts con métricas en el período para analizar." };
  }

  const [brandProfile, previousReport] = await Promise.all([
    getBrandProfile(),
    db.query.analysisReports.findFirst({ orderBy: (r, { desc }) => [desc(r.createdAt)] }),
  ]);

  const parts = [
    `Ficha de marca de Coinbox Mining:\n\n${brandProfile}`,
    previousReport ? `Informe de la semana anterior (${previousReport.periodFrom.toISOString().slice(0, 10)} a ${previousReport.periodTo.toISOString().slice(0, 10)}):\n\n${previousReport.summary}` : null,
    `Datos de Instagram del período actual:\n\n${JSON.stringify(payload, null, 1)}`,
    "Generá el informe.",
  ].filter((p): p is string => p != null);

  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  try {
    const response = await client.messages.create({
      model: ORGANIC_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: ORGANIC_SYSTEM_PROMPT,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: parts.join("\n\n---\n\n") }],
    });

    const summary = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    if (!summary) {
      return { ok: false, status: 502, error: "El modelo no devolvió texto." };
    }

    const [report] = await db
      .insert(analysisReports)
      .values({ periodFrom: from, periodTo: to, summary, modelUsed: ORGANIC_MODEL })
      .returning();

    return { ok: true, id: report.id, summary, createdAt: report.createdAt };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, status: 500, error: "API key de Anthropic inválida. Revisá ANTHROPIC_API_KEY en Vercel." };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, status: 429, error: "Rate limit de Anthropic. Probá en unos minutos." };
    }
    if (err instanceof Anthropic.PermissionDeniedError || err instanceof Anthropic.BadRequestError) {
      return { ok: false, status: 402, error: "No hay créditos disponibles en la cuenta de Anthropic. Cargá saldo en console.anthropic.com → Billing." };
    }
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}
