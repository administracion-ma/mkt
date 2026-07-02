import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db/client";
import { analysisReports } from "@/db/schema";
import { env } from "@/lib/env";
import { buildAnalysisPayload, resolvePeriod } from "@/lib/analysis-payload";
import { getBrandProfile } from "@/lib/brand/actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `Sos el analista de marketing de Coinbox Mining. Analizás las métricas de Instagram y producís un informe accionable en español rioplatense. Te paso una ficha de marca con contexto del negocio — usala para que las recomendaciones sean específicas de Coinbox, no genéricas de manual.

Reglas:
- Basate en los datos provistos para las métricas. No inventes números.
- Priorizá las señales según el algoritmo de Instagram 2026: shares > guardados > comentarios > watch time > likes.
- Skip rate: sano <30%, crítico >50% (pérdida de distribución).
- Sé directo y concreto. Nada de relleno ni generalidades de manual.
- Tenés una herramienta de búsqueda web: usala con moderación (2-3 búsquedas como mucho) solo si aporta algo concreto — un cambio reciente del algoritmo de Instagram, una tendencia de formato que valga la pena probar. No la uses si no hace falta.
- Si te paso el informe de la semana anterior, hacé seguimiento explícito: si una acción que sugeriste se ve reflejada en los datos nuevos, decilo; si no, notalo.
- Los posts destacados traen comentarios reales cuando hay. Son la señal más directa de qué le interesa a la audiencia — si ves un patrón (preguntas repetidas, objeciones, pedidos), usalo para la hipótesis o las acciones.

Estructura fija del informe (usá exactamente estos títulos, sin markdown, solo texto plano con emojis):
📊 RESUMEN — 2-3 oraciones sobre el estado general del período.
✅ QUÉ FUNCIONÓ — 2-3 puntos con datos concretos (mencioná posts por su caption resumido).
❌ QUÉ NO FUNCIONÓ — 2-3 puntos con datos concretos.
💡 HIPÓTESIS — por qué pasó lo que pasó.
🔁 SEGUIMIENTO — si había informe anterior, qué pasó con lo que se sugirió (omitir esta sección si es el primer informe).
🎯 ACCIONES PARA LA SEMANA — exactamente 3 acciones concretas y ejecutables (qué postear, cuándo, qué cambiar).`;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { from, to } = resolvePeriod(body.from, body.to);

  const payload = await buildAnalysisPayload(from, to);
  if (!payload) {
    return NextResponse.json(
      { error: "No hay suficientes posts con métricas en el período para analizar." },
      { status: 400 }
    );
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
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: parts.join("\n\n---\n\n") }],
    });

    const summary = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    if (!summary) {
      return NextResponse.json({ error: "El modelo no devolvió texto." }, { status: 502 });
    }

    const [report] = await db
      .insert(analysisReports)
      .values({ periodFrom: from, periodTo: to, summary, modelUsed: MODEL })
      .returning();

    return NextResponse.json({ id: report.id, summary, createdAt: report.createdAt });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "API key de Anthropic inválida. Revisá ANTHROPIC_API_KEY en Vercel." },
        { status: 500 }
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Rate limit de Anthropic. Probá en unos minutos." }, { status: 429 });
    }
    if (err instanceof Anthropic.PermissionDeniedError || err instanceof Anthropic.BadRequestError) {
      return NextResponse.json(
        { error: "No hay créditos disponibles en la cuenta de Anthropic. Cargá saldo en console.anthropic.com → Billing." },
        { status: 402 }
      );
    }
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
