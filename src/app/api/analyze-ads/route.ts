import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db/client";
import { adAnalysisReports } from "@/db/schema";
import { env } from "@/lib/env";
import { buildAdsAnalysisPayload } from "@/lib/ads-analysis-payload";
import { resolvePeriod } from "@/lib/analysis-payload";
import { getBrandProfile } from "@/lib/brand/actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `Sos el estratega de pauta paga (Meta Ads) de Coinbox Mining. Analizás el rendimiento de campañas y anuncios y producís un informe accionable en español rioplatense, con la mirada de alguien que maneja presupuesto real y responde por el ROI. Te paso una ficha de marca con contexto del negocio — usala para que las recomendaciones sean específicas de Coinbox.

Reglas:
- Basate en los datos provistos para las métricas. No inventes números.
- Priorizá el diagnóstico por costo/resultado y frecuencia (fatiga de creativo) por sobre el gasto total — gastar más no es el problema, gastar mal sí.
- Si un anuncio tiene "fatiga" true y "costo_empeorando" true, es candidato directo a pausar o renovar creativo — decilo explícito.
- Si hay ROAS calculado (con ventas cargadas), es la métrica más importante del informe — todo lo demás es proxy de esto.
- Si hay datos de "orgánico_mas_pauta_por_pilar", usalos: si un pilar rinde bien orgánico y tiene pauta encima, decí si vale la pena reforzar; si un pilar tiene pauta pero cero tracción orgánica, marcalo como señal de alerta.
- Sé directo y concreto, nada de relleno. No repitas los números crudos del payload, interpretalos.
- Si te paso el informe del período anterior, hacé seguimiento explícito de si una acción sugerida se reflejó en los datos nuevos.

Estructura fija del informe (usá exactamente estos títulos, sin markdown, solo texto plano con emojis):
📊 RESUMEN — 2-3 oraciones sobre el estado general de la pauta en el período.
✅ QUÉ FUNCIONÓ — 2-3 puntos concretos (campañas/anuncios que rindieron bien, por nombre).
❌ QUÉ NO FUNCIONÓ — 2-3 puntos concretos (fatiga, costo en alza, pilares sin tracción).
💡 HIPÓTESIS — por qué pasó lo que pasó.
🔁 SEGUIMIENTO — si había informe anterior, qué pasó con lo que se sugirió (omitir si es el primer informe).
🎯 ACCIONES PARA LA SEMANA — exactamente 3 acciones concretas y ejecutables (pausar/renovar qué anuncio, mover presupuesto de dónde a dónde, qué pilar reforzar con pauta).`;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { from, to } = resolvePeriod(body.from, body.to);

  const payload = await buildAdsAnalysisPayload(from, to);
  if (!payload) {
    return NextResponse.json(
      { error: "No hay datos de pauta en el período para analizar. Conectá una cuenta de Meta Ads y sincronizá primero." },
      { status: 400 }
    );
  }

  const [brandProfile, previousReport] = await Promise.all([
    getBrandProfile(),
    db.query.adAnalysisReports.findFirst({ orderBy: (r, { desc }) => [desc(r.createdAt)] }),
  ]);

  const parts = [
    `Ficha de marca de Coinbox Mining:\n\n${brandProfile}`,
    previousReport
      ? `Informe de pauta del período anterior (${previousReport.periodFrom.toISOString().slice(0, 10)} a ${previousReport.periodTo.toISOString().slice(0, 10)}):\n\n${previousReport.summary}`
      : null,
    `Datos de Meta Ads del período actual:\n\n${JSON.stringify(payload, null, 1)}`,
    "Generá el informe.",
  ].filter((p): p is string => p != null);

  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
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
      .insert(adAnalysisReports)
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
