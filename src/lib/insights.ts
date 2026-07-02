// Agregados de métricas para los paneles de insights y el informe de IA.
// Todo se calcula sobre PostCardRow (posts publicados + último snapshot).

export type InsightRow = {
  id: number;
  igMediaId?: string | null;
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

// ── Alcance por semana (últimas N semanas, lunes a domingo) ──────────────────
export type WeekPoint = { weekStart: string; medianReach: number | null; count: number };

function mondayOf(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay(); // 0 = domingo
  copy.setDate(copy.getDate() - ((day + 6) % 7));
  return copy;
}

export function weeklyReach(rows: InsightRow[], weeks = 12): WeekPoint[] {
  const byWeek = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.publishedAt || r.reach == null) continue;
    const key = mondayOf(new Date(r.publishedAt)).toISOString().slice(0, 10);
    (byWeek.get(key) ?? byWeek.set(key, []).get(key)!).push(r.reach);
  }
  const out: WeekPoint[] = [];
  const cursor = mondayOf(new Date());
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
