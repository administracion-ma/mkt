import { and, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { posts } from "@/db/schema";
import { createPost, deletePost, publishPostNow } from "@/lib/posts/actions";
import { CalendarView } from "@/components/calendar/CalendarView";
import type { CalendarPost } from "@/components/calendar/types";
import { getAnalyticsRows } from "@/lib/analytics-data";
import { bestTimeHeatmap, DAY_LABELS, SLOT_LABELS } from "@/lib/insights";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  const { month: monthParam, view: viewParam } = await searchParams;
  const now = new Date();
  const [yearStr, monthStr] = (monthParam ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`).split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1; // 0-indexed
  const monthStart = new Date(year, month, 1);
  const nextMonthStart = new Date(year, month + 1, 1);

  // Traemos con un margen de una semana antes/después para cubrir los días
  // de los meses adyacentes que se ven en la grilla.
  const rangeStart = new Date(year, month, -7);
  const rangeEnd = new Date(year, month + 1, 7);

  const [allPillars, allEditors, monthPosts, analyticsRows] = await Promise.all([
    db.query.pillars.findMany({ orderBy: (p, { asc }) => [asc(p.id)] }),
    db.query.editors.findMany({ orderBy: (e, { asc }) => [asc(e.id)] }),
    db.query.posts.findMany({
      where: and(gte(posts.scheduledAt, rangeStart), lt(posts.scheduledAt, rangeEnd)),
      orderBy: (p, { asc }) => [asc(p.scheduledAt)],
    }),
    // Todo el histórico — el mejor horario sale del heatmap de Analítica,
    // acá cerramos el loop: la data de cuándo rinde alimenta el cuándo programar.
    getAnalyticsRows().catch(() => []),
  ]);

  const heatBest = bestTimeHeatmap(analyticsRows).best;
  const bestTime = heatBest
    ? {
        day: heatBest.day,
        slot: heatBest.slot,
        label: `${DAY_LABELS[heatBest.day]} ${SLOT_LABELS[heatBest.slot]}`,
        medianReach: heatBest.median,
      }
    : null;

  const calendarPosts: CalendarPost[] = monthPosts.map((p) => ({
    id: p.id,
    pillarId: p.pillarId,
    caption: p.caption,
    mediaType: p.mediaType,
    mediaUrl: p.mediaUrl,
    scheduledAt: p.scheduledAt.toISOString(),
    status: p.status,
    igPermalink: p.igPermalink,
    productionStatus: p.productionStatus,
    channel: p.channel,
    format: p.format,
    editorId: p.editorId,
    rawFootageUrl: p.rawFootageUrl,
  }));

  // Acotado al mes exacto (sin el relleno de días adyacentes que necesita la
  // Grilla) — lo que usa la vista Briefs.
  const strictMonthPosts = calendarPosts.filter((p) => {
    const t = new Date(p.scheduledAt).getTime();
    return t >= monthStart.getTime() && t < nextMonthStart.getTime();
  });

  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">Calendario de contenido</h1>
        <p className="page-subtitle">Programá y gestioná tus posts de Instagram</p>
      </div>

      <div className="card">
        <CalendarView
          year={year}
          month={month}
          gridPosts={calendarPosts}
          monthPosts={strictMonthPosts}
          pillars={allPillars}
          editors={allEditors}
          bestTime={bestTime}
          createPost={createPost}
          deletePost={deletePost}
          publishPostNow={publishPostNow}
          initialView={viewParam === "briefs" ? "briefs" : "grid"}
        />
      </div>
    </main>
  );
}
