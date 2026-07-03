import { db } from "@/db/client";
import { getAnalyticsRows } from "@/lib/analytics-data";
import {
  weeklyReach,
  bestTimeHeatmap,
  hookRanking,
  pillarPerformance,
  hashtagPerformance,
  median,
  DAY_LABELS,
  SLOT_LABELS,
  type InsightRow,
} from "@/lib/insights";
import { getConnectedAccount } from "@/lib/instagram/account-store";
import { getMediaComments } from "@/lib/instagram/graph-api";

function pct(n: number | null): string | null {
  return n != null ? `${(n * 100).toFixed(2)}%` : null;
}

// Comentarios reales de los posts destacados (top/bottom) — señal rica que
// muestra qué le interesa a la audiencia. Se limita a estos pocos posts
// para no pagar una llamada a la API por cada post del período.
async function fetchCommentsFor(rows: InsightRow[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  const account = await getConnectedAccount().catch(() => null);
  if (!account) return map;

  const withMediaId = rows.filter((r) => r.igMediaId);
  await Promise.all(
    withMediaId.map(async (r) => {
      const comments = await getMediaComments(r.igMediaId!, account.accessToken, 10);
      if (comments.length > 0) map.set(r.id, comments);
    })
  );
  return map;
}

// Agregados de un período para mandarle al modelo — nunca el dataset crudo.
// Compartido entre el informe semanal y las preguntas puntuales.
export async function buildAnalysisPayload(from: Date, to: Date) {
  const rows = await getAnalyticsRows(from, to);
  const allRows = await getAnalyticsRows(); // tendencia y horarios usan todo el histórico

  const withData = rows.filter((r) => r.reach != null).length;
  if (withData < 3) return null;

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

  // Ranking de pilares sobre todo el histórico (más muestra, comparación más confiable)
  const allPillars = await db.query.pillars.findMany();
  const pillarStats = pillarPerformance(allRows, allPillars);
  const hashtagStats = hashtagPerformance(rows);

  const topRows = [...rows]
    .filter((r) => r.reach != null)
    .sort((a, b) => (rate(b.sharesCount, b.reach) ?? 0) - (rate(a.sharesCount, a.reach) ?? 0))
    .slice(0, 5);

  const bottomRows = [...rows]
    .filter((r) => r.reach != null && r.reach > 0)
    .sort((a, b) => (a.reach ?? 0) - (b.reach ?? 0))
    .slice(0, 3);

  const commentsByPostId = await fetchCommentsFor([...topRows, ...bottomRows]);

  const topPosts = topRows.map((r) => ({
    caption: r.caption?.slice(0, 100),
    tipo: r.mediaType,
    alcance: r.reach,
    share_rate: pct(rate(r.sharesCount, r.reach)),
    save_rate: pct(rate(r.savedCount, r.reach)),
    skip: r.skipRate,
    seguidores_ganados: r.followsCount,
    comentarios: commentsByPostId.get(r.id) ?? undefined,
  }));

  const bottomPosts = bottomRows.map((r) => ({
    caption: r.caption?.slice(0, 100),
    tipo: r.mediaType,
    alcance: r.reach,
    skip: r.skipRate,
    comentarios: commentsByPostId.get(r.id) ?? undefined,
  }));

  return {
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
    ranking_pilares: pillarStats.map((s) => ({
      pilar: s.label,
      posts: s.posts,
      alcance_mediano: s.alcanceMediano,
      er_mediana: pct(s.erMediana),
      guardado_mediano: pct(s.saveRateMediana),
      share_mediano: pct(s.shareRateMediana),
    })),
    hashtags_destacados: hashtagStats.slice(0, 8).map((h) => ({
      hashtag: h.tag,
      posts: h.posts,
      alcance_mediano: h.alcanceMediano,
      share_mediano: pct(h.shareRateMediana),
    })),
  };
}

export type AnalysisPayload = NonNullable<Awaited<ReturnType<typeof buildAnalysisPayload>>>;

export function resolvePeriod(from?: string, to?: string): { from: Date; to: Date } {
  const toDate = to ? new Date(to + "T23:59:59") : new Date();
  const fromDate = from ? new Date(from + "T00:00:00") : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: fromDate, to: toDate };
}
