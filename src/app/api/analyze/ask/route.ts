import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { buildAnalysisPayload, resolvePeriod } from "@/lib/analysis-payload";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `Sos el analista de marketing de Coinbox Mining (venta y hosting de equipos de minería de criptomonedas, Argentina). Te hacen preguntas puntuales sobre las métricas de Instagram del período dado.

Reglas:
- Basate SOLO en los datos provistos. Si la pregunta no se puede responder con esos datos, decilo claramente en vez de inventar.
- Priorizá las señales según el algoritmo de Instagram 2026: shares > guardados > comentarios > watch time > likes.
- Respondé en español rioplatense, directo y concreto, sin relleno.
- Respuesta corta: 2-5 oraciones salvo que la pregunta pida una lista.
- Texto plano, sin markdown.`;

const MAX_HISTORY = 6;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const question: string = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "Falta la pregunta." }, { status: 400 });
  }

  const history: { question: string; answer: string }[] = Array.isArray(body.history)
    ? body.history.slice(-MAX_HISTORY)
    : [];

  const { from, to } = resolvePeriod(body.from, body.to);
  const payload = await buildAnalysisPayload(from, to);
  if (!payload) {
    return NextResponse.json(
      { error: "No hay suficientes posts con métricas en el período para responder." },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Datos de Instagram de Coinbox Mining para el período:\n\n${JSON.stringify(payload, null, 1)}`,
    },
    { role: "assistant", content: "Listo, tengo los datos del período. Preguntame." },
  ];
  for (const h of history) {
    messages.push({ role: "user", content: h.question });
    messages.push({ role: "assistant", content: h.answer });
  }
  messages.push({ role: "user", content: question });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages,
    });

    const answer = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    if (!answer) {
      return NextResponse.json({ error: "El modelo no devolvió texto." }, { status: 502 });
    }

    return NextResponse.json({ answer });
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
