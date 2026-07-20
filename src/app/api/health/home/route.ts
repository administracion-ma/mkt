import { NextResponse } from "next/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { actionItems, adInsights, posts, sales, youtubeVideos } from "@/db/schema";
import { getConnectedAccount } from "@/lib/instagram/account-store";
import { getConnectedAdAccount } from "@/lib/ads/account-store";
import { getAnalyticsRows } from "@/lib/analytics-data";
import { getUsdRate } from "@/lib/fx";
import { getGoals } from "@/lib/goals/actions";

// Diagnóstico de la página de inicio: corre cada fuente de datos del panel por
// separado y cronometrada, con un tope de 12s. Devuelve un JSON con cuántos ms
// tardó cada una (o TIMEOUT/ERROR). Sirve para encontrar exactamente qué
// consulta se cuelga y tumba el inicio con 504, sin adivinar.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function timed<T>(label: string, p: Promise<T>): Promise<[string, string]> {
  const start = Date.now();
  try {
    await Promise.race([
      p,
      new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT>12s")), 12000)),
    ]);
    return [label, `${Date.now() - start}ms`];
  } catch (e) {
    return [label, `ERROR (${Date.now() - start}ms): ${e instanceof Error ? e.message : String(e)}`];
  }
}

export async function GET() {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(to.getFullYear(), to.getMonth(), 1);
  const weekStart = new Date(to);
  weekStart.setDate(to.getDate() - ((to.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);

  const results = await Promise.all([
    timed("igAccount", getConnectedAccount()),
    timed("adAccount", getConnectedAdAccount()),
    timed(
      "actionItems",
      db.query.actionItems.findMany({
        where: eq(actionItems.status, "open"),
        orderBy: (a, { desc }) => [desc(a.createdAt)],
      }),
    ),
    timed("analyticsRows", getAnalyticsRows(from, to)),
    timed(
      "accountMetrics",
      db.query.accountMetrics.findMany({ orderBy: (m, { desc }) => [desc(m.capturedAt)] }),
    ),
    timed(
      "ytChannelMetrics",
      db.query.youtubeChannelMetrics.findMany({ orderBy: (m, { desc }) => [desc(m.capturedAt)] }),
    ),
    timed("goals", getGoals()),
    timed(
      "adInsights",
      db.query.adInsights.findMany({ where: and(gte(adInsights.date, from), lte(adInsights.date, to)) }),
    ),
    timed(
      "sales",
      db.query.sales.findMany({ where: and(gte(sales.occurredAt, from), lte(sales.occurredAt, to)) }),
    ),
    timed("monthSales", db.query.sales.findMany({ where: gte(sales.occurredAt, monthStart) })),
    timed("weekPosts", db.query.posts.findMany({ where: gte(posts.scheduledAt, weekStart) })),
    timed(
      "lastYtVideo",
      db.query.youtubeVideos.findFirst({
        where: eq(youtubeVideos.status, "PUBLISHED"),
        orderBy: (v, { desc }) => [desc(v.publishedAt)],
      }),
    ),
    timed("usdRate", getUsdRate("PYG")),
  ]);

  return NextResponse.json(Object.fromEntries(results));
}
