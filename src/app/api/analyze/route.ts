import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db/client";
import { analysisReports } from "@/db/schema";
import { env } from "@/lib/env";
import { getAnalyticsRows } from "@/lib/analytics-data";
import { weeklyReach, bestTimeHeatmap, hookRanking, median, DAY_LABELS, SLOT_LABELS } from "@/lib/insights";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `Sos el analista de marketing de Coinbox Mining (venta y hosting de equipos de minería de criptomonedas, Argentina). Analizás las métricas de Instagram y producís un informe accionable en español rioplatense.

Reglas:
- Basate SOLO en los datos provistos. No inventes números ni tendencias.
- Priorizá las señales según el algoritmo de Instagram 2026: shares > guardados > comentarios > watch time > likes.
- Skip rate: sano <30%, crítico >50% (pérdida de distribución).
- Sé directo y concreto. Nada de relleno ni generalidades de manual.

Estructura fija del informe (usá exactamente estos títulos, sin markdown, solo texto plano con emojis):
📊 RESUMEN — 2-3 oraciones sobre el estado general del período.
✅ QUÉ FUNCIONÓ — 2-3 puntos con datos concretos (mencioná posts por su caption resumido).
❌ QUÉ NO FUNCIONÓ — 2-3 puntos con datos concretos.
💡 HIPÓTESIS — por qué pasó lo que pasó.
🎯 ACCIONES PARA LA SEMANA — exactamente 3 acciones concretas y ejecutables (qué postear, cuándo, qué cambiar).`;

function pct(n: number | null): string | null {
  return n != null ? `${(n * 100).toFixed(2)}%` : null;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const to = body.to ? new Date(body.to + "T23:59:59") : new Date();
  const from = body.from
    ? new Date(body.from + "T00:00:00")
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  const rows = await getAnalyticsRows(from, to);
  const allRows = await getAnalyticsRows(); // para tendencia y horarios usamos todo el histórico

  if (rows.filter((r) => r.reach != null).length < 3) {
    return NextResponse.json(
      { error: "No hay suficientes posts con métricas en el período para analizar." },
      { status: 400 }
    );
  }

  const rate = (num: number | null, denom: number | null) =>
    denom && num != null ? num / denom : null;

  const isVideo = (t: string) => t === "REELS" || t === "VIDEO";
  const videos = rows.filter((r) => isVideo(r.mediaType));
  const images = rows.filter((r) => !isVideo(r.mediaType));

  const summarize = (rs: typeof rows) => ({
    posts: rs.length,
    alcance_mediano: median(rs.map((r) => r.reach).filter((v): v is number => v != null)),
    share_rate_mediano: pct(median(rs.map((r) => rate(r.sharesCount, r.reach)).filter((v): v is number => v != null))),
    save_rate_mediano: pct(median(rs.map((r) => rate(r.savedCount, r.reach)).filter((v): v is number => v != null))),
    skip_mediano: median(rs.map((r) => r.skipRate).filter((v): v is number => v != null)),
  });

  const hooks = hookRanking(rows);
  const heatmap = bestTimeHeatmap(allRows);
  const weeks = weeklyReach(allRows, 8).filter((w) => w.medianReach != null);

  const topPosts = [...rows]
    .filter((r) => r.reach != null)
    .sort((a, b) => (rate(b.sharesCount, b.reach) ?? 0) - (rate(a.sharesCount, a.reach) ?? 0))
    .slice(0, 5)
    .map((r) => ({
      caption: r.caption?.slice(0, 100),
      tipo: r.mediaType,
      alcance: r.reach,
      share_rate: pct(rate(r.sharesCount, r.reach)),
      save_rate: pct(rate(r.savedCount, r.reach)),
      skip: r.skipRate,
      seguidores_ganados: r.followsCount,
    }));

  const bottomPosts = [...rows]
    .filter((r) => r.reach != null && r.reach > 0)
    .sort((a, b) => (a.reach ?? 0) - (b.reach ?? 0))
    .slice(0, 3)
    .map((r) => ({ caption: r.caption?.slice(0, 100), tipo: r.mediaType, alcance: r.reach, skip: r.skipRate }));

  const payload = {
    periodo: { desde: from.toISOString().slice(0, 10), hasta: to.toISOString().slice(0, 10) },
    videos: summarize(videos),
    imagenes_y_carruseles: summarize(images),
    ganchos: {
      skip_mediano: hooks.medianSkip,
      mejores: hooks.best.map((p) => ({ caption: p.caption?.slice(0, 80), skip: p.skipRate, alcance: p.reach })),
      peores: hooks.worst.map((p) => ({ caption: p.caption?.slice(0, 80), skip: p.skipRate, alcance: p.reach })),
    },
    mejor_horario: heatmap.best
      ? { dia: DAY_LABELS[heatmap.best.day], franja: SLOT_LABELS[heatmap.best.slot], alcance_mediano: heatmap.best.median, posts: heatmap.best.count }
      : null,
    alcance_semanal_historico: weeks.map((w) => ({ semana: w.weekStart, mediana: w.medianReach, posts: w.count })),
    top_5_posts_por_share_rate: topPosts,
    peores_3_por_alcance: bottomPosts,
  };

  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Datos de Instagram de Coinbox Mining:\n\n${JSON.stringify(payload, null, 1)}\n\nGenerá el informe.`,
        },
      ],
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
