// Agregados de métricas para los paneles de insights y el informe de IA.
// Todo se calcula sobre PostCardRow (posts publicados + último snapshot).

export type InsightRow = {
  id: number;
  igMediaId?: string | null;
  pillarId?: number | null;
  publishedAt: string | null;
  mediaType: string;
  caption: string | null;
  igPermalink: string | null;
  mediaUrl: string | null;
  reach: number | null;
  plays: number | null;
  likeCount: number | null;
  commentCount: number | null;
  savedCount: number | null;
  sharesCount: number | null;
  avgWatchTimeMs: number | null;
  skipRate: number | null;
  followsCount: number | null;
  videoDurationMs: number | null;
};

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

export function rate(num: number | null | undefined, denom: number | null | undefined): number | null {
  if (!denom || num == null) return null;
  return num / denom;
}

function engagementRate(r: InsightRow): number | null {
  if (!r.reach) return null;
  return ((r.likeCount ?? 0) + (r.commentCount ?? 0) + (r.savedCount ?? 0) + (r.sharesCount ?? 0)) / r.reach;
}

// ── Alcance por semana (últimas N semanas, lunes a domingo) ──────────────────
export type WeekPoint = { weekStart: string; medianReach: number | null; count: number };

function mondayOf(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay(); // 0 = domingo
  copy.setDate(copy.getDate() - ((day + 6) % 7));
  return copy;
}

// anchorDate: fin de la ventana de semanas — por defecto hoy, pero si el
// usuario filtró a un período viejo hay que anclar ahí, si no las semanas
// no coinciden con lo que se está mirando y el gráfico sale vacío.
export function weeklyReach(rows: InsightRow[], weeks = 12, anchorDate = new Date()): WeekPoint[] {
  const byWeek = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.publishedAt || r.reach == null) continue;
    const key = mondayOf(new Date(r.publishedAt)).toISOString().slice(0, 10);
    (byWeek.get(key) ?? byWeek.set(key, []).get(key)!).push(r.reach);
  }
  const out: WeekPoint[] = [];
  const cursor = mondayOf(anchorDate);
  cursor.setDate(cursor.getDate() - 7 * (weeks - 1));
  for (let i = 0; i < weeks; i++) {
    const key = cursor.toISOString().slice(0, 10);
    const vals = byWeek.get(key) ?? [];
    out.push({ weekStart: key, medianReach: median(vals), count: vals.length });
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}

// ── Heatmap día × franja horaria ─────────────────────────────────────────────
export const SLOT_LABELS = ["0-6h", "6-12h", "12-18h", "18-24h"];
export const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export type HeatCell = { day: number; slot: number; median: number | null; count: number };

export function bestTimeHeatmap(rows: InsightRow[]): { cells: HeatCell[]; best: HeatCell | null } {
  const buckets = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.publishedAt || r.reach == null) continue;
    const d = new Date(r.publishedAt);
    const day = (d.getDay() + 6) % 7; // 0 = lunes
    const slot = Math.floor(d.getHours() / 6);
    const key = `${day}-${slot}`;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(r.reach);
  }
  const cells: HeatCell[] = [];
  let best: HeatCell | null = null;
  for (let day = 0; day < 7; day++) {
    for (let slot = 0; slot < 4; slot++) {
      const vals = buckets.get(`${day}-${slot}`) ?? [];
      const cell = { day, slot, median: median(vals), count: vals.length };
      cells.push(cell);
      // El "mejor horario" exige al menos 3 posts para no elegir un outlier
      if (cell.count >= 3 && cell.median != null && (best?.median == null || cell.median > best.median)) {
        best = cell;
      }
    }
  }
  return { cells, best };
}

// ── Diagnóstico de ganchos (skip rate en videos) ─────────────────────────────
export type HookPost = {
  id: number;
  caption: string | null;
  igPermalink: string | null;
  mediaUrl: string | null;
  skipRate: number;
  avgWatchTimeMs: number | null;
  reach: number | null;
};

export function hookRanking(rows: InsightRow[]): {
  best: HookPost[];
  worst: HookPost[];
  medianSkip: number | null;
} {
  const videos = rows
    .filter(
      (r): r is InsightRow & { skipRate: number } =>
        (r.mediaType === "REELS" || r.mediaType === "VIDEO") && r.skipRate != null
    )
    .map((r) => ({
      id: r.id,
      caption: r.caption,
      igPermalink: r.igPermalink,
      mediaUrl: r.mediaUrl,
      skipRate: r.skipRate,
      avgWatchTimeMs: r.avgWatchTimeMs,
      reach: r.reach,
    }))
    .sort((a, b) => a.skipRate - b.skipRate);

  return {
    best: videos.slice(0, 3),
    worst: videos.slice(-3).reverse(),
    medianSkip: median(videos.map((v) => v.skipRate)),
  };
}

// ── Ranking de pilares de contenido ───────────────────────────────────────────
export type PillarStat = {
  pillarId: number;
  label: string;
  posts: number;
  alcanceMediano: number | null;
  erMediana: number | null;
  saveRateMediana: number | null;
  shareRateMediana: number | null;
};

// Mínimo de posts para que un pilar entre al ranking — evita que un pilar con
// 1 post viral parezca "el mejor" por pura casualidad.
const MIN_POSTS_FOR_RANKING = 3;

export function pillarPerformance(
  rows: InsightRow[],
  pillars: { id: number; label: string }[]
): PillarStat[] {
  const byPillar = new Map<number, InsightRow[]>();
  for (const r of rows) {
    if (r.pillarId == null || r.reach == null) continue;
    (byPillar.get(r.pillarId) ?? byPillar.set(r.pillarId, []).get(r.pillarId)!).push(r);
  }

  const stats: PillarStat[] = [];
  for (const pillar of pillars) {
    const rs = byPillar.get(pillar.id) ?? [];
    if (rs.length < MIN_POSTS_FOR_RANKING) continue;
    stats.push({
      pillarId: pillar.id,
      label: pillar.label,
      posts: rs.length,
      alcanceMediano: median(rs.map((r) => r.reach).filter((v): v is number => v != null)),
      erMediana: median(rs.map(engagementRate).filter((v): v is number => v != null)),
      saveRateMediana: median(rs.map((r) => rate(r.savedCount, r.reach)).filter((v): v is number => v != null)),
      shareRateMediana: median(rs.map((r) => rate(r.sharesCount, r.reach)).filter((v): v is number => v != null)),
    });
  }

  return stats.sort((a, b) => (b.erMediana ?? 0) - (a.erMediana ?? 0));
}

// ── Rendimiento de hashtags ───────────────────────────────────────────────────
export type HashtagStat = {
  tag: string;
  posts: number;
  alcanceMediano: number | null;
  shareRateMediana: number | null;
};

const MIN_POSTS_FOR_HASHTAG = 2;

export function extractHashtags(caption: string | null): string[] {
  if (!caption) return [];
  const matches = caption.match(/#[\p{L}0-9_]+/gu) ?? [];
  return Array.from(new Set(matches.map((h) => h.toLowerCase())));
}

export function hashtagPerformance(rows: InsightRow[]): HashtagStat[] {
  const byTag = new Map<string, InsightRow[]>();
  for (const r of rows) {
    if (r.reach == null) continue;
    for (const tag of extractHashtags(r.caption)) {
      (byTag.get(tag) ?? byTag.set(tag, []).get(tag)!).push(r);
    }
  }

  const stats: HashtagStat[] = [];
  for (const [tag, rs] of byTag) {
    if (rs.length < MIN_POSTS_FOR_HASHTAG) continue;
    stats.push({
      tag,
      posts: rs.length,
      alcanceMediano: median(rs.map((r) => r.reach).filter((v): v is number => v != null)),
      shareRateMediana: median(rs.map((r) => rate(r.sharesCount, r.reach)).filter((v): v is number => v != null)),
    });
  }

  return stats.sort((a, b) => (b.alcanceMediano ?? 0) - (a.alcanceMediano ?? 0)).slice(0, 15);
}

// Para distinguir, cuando no hay ranking, entre "no usaron hashtags en este
// período" (dato de siempre) y "usaron pero ninguno se repite" — y para decir
// desde cuándo no se usan, hace falta mirar más allá del período: allRows.
export function hashtagUsageSummary(
  periodRows: InsightRow[],
  allCaptions: { caption: string | null; publishedAt: string | null }[]
): { stats: HashtagStat[]; anyInPeriod: boolean; lastUsedAt: string | null } {
  const stats = hashtagPerformance(periodRows);
  const anyInPeriod = periodRows.some((r) => extractHashtags(r.caption).length > 0);
  const withTag = allCaptions
    .filter((r) => r.publishedAt != null && extractHashtags(r.caption).length > 0)
    .sort((a, b) => (b.publishedAt! > a.publishedAt! ? 1 : -1));
  return { stats, anyInPeriod, lastUsedAt: withTag[0]?.publishedAt ?? null };
}
