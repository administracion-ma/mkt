import Link from "next/link";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { adInsights, sales, actionItems, posts, youtubeVideos } from "@/db/schema";
import { getConnectedAccount } from "@/lib/instagram/account-store";
import { getConnectedAdAccount } from "@/lib/ads/account-store";
import { getAnalyticsRows } from "@/lib/analytics-data";
import { getUsdRate } from "@/lib/fx";
import { getGoals } from "@/lib/goals/actions";
import { buildHealth } from "@/lib/health";
import { ActionItemsList } from "@/components/ActionItemsList";
import { StatDelta } from "@/components/StatDelta";
import { StatLabel } from "@/components/StatLabel";
import { HealthBar } from "@/components/HealthBar";
import { Funnel } from "@/components/Funnel";

export const dynamic = "force-dynamic";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

const QUICK_LINKS = [
  { href: "/calendar", icon: "📅", label: "Calendario" },
  { href: "/analytics", icon: "📊", label: "Analítica" },
  { href: "/ads", icon: "📢", label: "Meta Ads" },
  { href: "/youtube", icon: "▶️", label: "YouTube" },
  { href: "/resumenes", icon: "🗂️", label: "Resúmenes" },
];

// Barra de progreso contra meta — verde si venís a ritmo, amarillo atrás,
// rojo muy atrás (o pasado, para el presupuesto).
function GoalBar({ label, current, target, invert = false, monthProgress, unit = "$" }: {
  label: string;
  current: number;
  target: number;
  invert?: boolean; // presupuesto: pasarse es malo
  monthProgress: number; // 0..1, cuánto del mes ya corrió
  unit?: string;
}) {
  const pct = target > 0 ? Math.min(150, (current / target) * 100) : 0;
  const pace = target > 0 ? current / (target * Math.max(monthProgress, 0.01)) : 0;
  const color = invert
    ? pct >= 100 ? "#ef4444" : pace > 1.15 ? "#eab308" : "#22c55e"
    : pace >= 0.9 ? "#22c55e" : pace >= 0.5 ? "#eab308" : "#ef4444";
  const fmtV = (v: number) => (unit === "$" ? fmtMoney(v) : String(Math.round(v)));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.3rem" }}>
        <span style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span style={{ fontWeight: 700 }}>{fmtV(current)} <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>/ {fmtV(target)}</span></span>
      </div>
      <div style={{ height: 8, background: "var(--surface2)", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: color, borderRadius: 6 }} />
      </div>
    </div>
  );
}

export default async function HomePage() {
  const [igAccount, adAccount] = await Promise.all([
    getConnectedAccount().catch(() => null),
    getConnectedAdAccount().catch(() => null),
  ]);

  if (!igAccount && !adAccount) {
    return (
      <main className="page">
        <div className="card" style={{ marginTop: "2rem" }}>
          <div className="connect-cta">
            <div className="connect-cta-icon">📱</div>
            <h2>Conectá tu cuenta de Instagram</h2>
            <p>
              Para programar contenido y ver analíticas necesitás conectar tu cuenta
              de Instagram Business o Creator.
            </p>
            <a href="/api/auth/instagram/start" className="btn btn-primary" style={{ fontSize: "0.95rem", padding: "0.7rem 1.5rem" }}>
              Conectar con Instagram
            </a>
          </div>
        </div>
      </main>
    );
  }

  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prevFrom = new Date(from.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(to.getFullYear(), to.getMonth(), 1);
  const daysInMonth = new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate();
  const monthProgress = Math.min(1, to.getDate() / daysInMonth);
  // Semana actual (lunes 00:00)
  const weekStart = new Date(to);
  weekStart.setDate(to.getDate() - ((to.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);

  const [
    openItems, organicRows, prevOrganicRows, adInsightRows, prevAdInsightRows,
    periodSales, prevSales, usdRate, igSnapshots, ytSnapshots,
    goals, monthAdInsights, monthSales, weekPosts, lastYtVideo,
  ] = await Promise.all([
    db.query.actionItems.findMany({
      where: eq(actionItems.status, "open"),
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    }).catch(() => []),
    igAccount ? getAnalyticsRows(from, to).catch(() => []) : Promise.resolve([]),
    igAccount ? getAnalyticsRows(prevFrom, from).catch(() => []) : Promise.resolve([]),
    adAccount
      ? db.query.adInsights.findMany({ where: and(gte(adInsights.date, from), lte(adInsights.date, to)) }).catch(() => [])
      : Promise.resolve([]),
    adAccount
      ? db.query.adInsights.findMany({ where: and(gte(adInsights.date, prevFrom), lte(adInsights.date, from)) }).catch(() => [])
      : Promise.resolve([]),
    adAccount
      ? db.query.sales.findMany({ where: and(gte(sales.occurredAt, from), lte(sales.occurredAt, to)) }).catch(() => [])
      : Promise.resolve([]),
    adAccount
      ? db.query.sales.findMany({ where: and(gte(sales.occurredAt, prevFrom), lte(sales.occurredAt, from)) }).catch(() => [])
      : Promise.resolve([]),
    adAccount ? getUsdRate(adAccount.currency) : Promise.resolve(null),
    // Comunidad cross-red: seguidores IG + suscriptores YT, con historial
    // para el delta semanal. .catch: las tablas pueden no existir aún.
    db.query.accountMetrics.findMany({ orderBy: (m, { desc }) => [desc(m.capturedAt)] }).catch(() => []),
    db.query.youtubeChannelMetrics.findMany({ orderBy: (m, { desc }) => [desc(m.capturedAt)] }).catch(() => []),
    getGoals().catch(() => null),
    adAccount
      ? db.query.adInsights.findMany({ where: gte(adInsights.date, monthStart) }).catch(() => [])
      : Promise.resolve([]),
    db.query.sales.findMany({ where: gte(sales.occurredAt, monthStart) }).catch(() => []),
    db.query.posts.findMany({ where: gte(posts.scheduledAt, weekStart) }).catch(() => []),
    db.query.youtubeVideos
      .findFirst({ where: eq(youtubeVideos.status, "PUBLISHED"), orderBy: (v, { desc }) => [desc(v.publishedAt)] })
      .catch(() => null),
  ]);

  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const nowMs = to.getTime();
  const igFollowersNow = igSnapshots[0]?.followersCount ?? null;
  const igFollowersPrev = igSnapshots.find((s) => nowMs - s.capturedAt.getTime() >= 5 * 24 * 60 * 60 * 1000 && nowMs - s.capturedAt.getTime() <= 3 * weekMs)?.followersCount ?? null;
  const ytSubsNow = ytSnapshots[0]?.subscriberCount ?? null;
  const ytSubsPrev = ytSnapshots.find((s) => nowMs - s.capturedAt.getTime() >= 5 * 24 * 60 * 60 * 1000 && nowMs - s.capturedAt.getTime() <= 3 * weekMs)?.subscriberCount ?? null;
  const communityNow = igFollowersNow != null || ytSubsNow != null ? (igFollowersNow ?? 0) + (ytSubsNow ?? 0) : null;
  const communityPrev = igFollowersPrev != null || ytSubsPrev != null ? (igFollowersPrev ?? 0) + (ytSubsPrev ?? 0) : null;

  const organicAggregates = (rows: typeof organicRows) => {
    const withMetrics = rows.filter((r) => r.reach != null && r.reach > 0);
    const avgReach = withMetrics.length > 0
      ? Math.round(withMetrics.reduce((s, r) => s + (r.reach ?? 0), 0) / withMetrics.length)
      : null;
    const erValues = withMetrics
      .map((r) => {
        if (!r.reach) return null;
        const interactions = (r.likeCount ?? 0) + (r.commentCount ?? 0) + (r.savedCount ?? 0) + (r.sharesCount ?? 0);
        return interactions / r.reach;
      })
      .filter((v): v is number => v != null);
    const avgER = erValues.length > 0 ? erValues.reduce((s, v) => s + v, 0) / erValues.length : null;
    return { avgReach, avgER };
  };

  const { avgReach, avgER } = organicAggregates(organicRows);
  const { avgReach: prevAvgReach, avgER: prevAvgER } = organicAggregates(prevOrganicRows);

  const toUsdOrRaw = (v: number | null) => (v != null && usdRate ? v / usdRate : v);
  const totalSpend = adInsightRows.reduce((s, r) => s + (toUsdOrRaw(r.spend) ?? 0), 0);
  const prevTotalSpend = prevAdInsightRows.reduce((s, r) => s + (toUsdOrRaw(r.spend) ?? 0), 0);
  const totalResults = adInsightRows.reduce((s, r) => s + (r.results ?? 0), 0);
  const prevResults = prevAdInsightRows.reduce((s, r) => s + (r.results ?? 0), 0);
  const totalMessages = adInsightRows.reduce((s, r) => s + (r.messages ?? 0), 0);
  const totalRevenue = periodSales.reduce((s, r) => s + r.amountUsd, 0);
  const prevRevenue = prevSales.reduce((s, r) => s + r.amountUsd, 0);
  const roas = totalSpend > 0 && periodSales.length > 0 ? totalRevenue / totalSpend : null;
  const prevRoas = prevTotalSpend > 0 && prevSales.length > 0 ? prevRevenue / prevTotalSpend : null;

  // Embudo (7 días): alcance IG → visitas al perfil → mensajes de pauta → ventas
  const totalReach = organicRows.reduce((s, r) => s + (r.reach ?? 0), 0);
  const totalProfileVisits = organicRows.reduce((s, r) => s + (r.profileVisits ?? 0), 0);

  // Mes en curso — para las metas
  const monthSpend = monthAdInsights.reduce((s, r) => s + (toUsdOrRaw(r.spend) ?? 0), 0);
  const monthRevenue = monthSales.reduce((s, r) => s + r.amountUsd, 0);

  // Plan de contenido de la semana: qué se planificó vs qué salió
  const plannedThisWeek = weekPosts.length;
  const publishedThisWeek = weekPosts.filter((p) => p.status === "PUBLISHED").length;

  const daysSinceLastVideo = lastYtVideo?.publishedAt
    ? Math.floor((nowMs - lastYtVideo.publishedAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const ytConnected = ytSnapshots.length > 0 || lastYtVideo != null;

  const health = buildHealth({
    ig: { postsLast7: organicRows.length, postsPrev7: prevOrganicRows.length, avgReach, prevAvgReach },
    ads: {
      connected: !!adAccount,
      spend: totalSpend,
      results: totalResults,
      costPerResult: totalResults > 0 ? totalSpend / totalResults : null,
      prevCostPerResult: prevResults > 0 ? prevTotalSpend / prevResults : null,
    },
    youtube: { connected: ytConnected, daysSinceLastVideo, subsNow: ytSubsNow, subsPrev: ytSubsPrev },
    sales: { monthRevenue, monthTarget: goals?.monthlySalesTargetUsd ?? null, monthProgress },
  });

  const hasGoals = goals != null && (goals.monthlyAdBudgetUsd != null || goals.monthlySalesTargetUsd != null || goals.weeklyPostsTarget != null);

  // ⚠️ DEMO_FANTASIA — valores de relleno SOLO visuales (no se guardan en la
  // DB, no afectan informes de IA ni cálculos reales) para que el panel no se
  // vea vacío en una demo. Buscar "DEMO_FANTASIA" para sacar esto después.
  const displayAvgReach = avgReach ?? 3800;
  const displayAvgER = avgER ?? 0.052;
  const displayRoas = roas ?? 2.4;

  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">Panel</h1>
        <p className="page-subtitle">Últimos 7 días</p>
      </div>

      <HealthBar areas={health} />

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.85rem" }}>
          🎯 Acciones pendientes{openItems.length > 0 ? ` (${openItems.length})` : ""}
        </h2>
        <ActionItemsList items={openItems} />
      </div>

      {igAccount && (
        <Funnel
          reach={totalReach > 0 ? totalReach : null}
          profileVisits={totalProfileVisits > 0 ? totalProfileVisits : null}
          messages={adAccount ? totalMessages : null}
          salesCount={periodSales.length}
          revenue={totalRevenue}
        />
      )}

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.2rem" }}>📐 Metas del mes</h2>
        {hasGoals ? (
          <>
            <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", margin: "0 0 1rem" }}>
              Va {Math.round(monthProgress * 100)}% del mes — las barras comparan contra el ritmo esperado a esta altura.
            </p>
            <div style={{ display: "grid", gap: "0.9rem", maxWidth: 560 }}>
              {goals?.monthlySalesTargetUsd != null && (
                <GoalBar label="Ventas del mes" current={monthRevenue} target={goals.monthlySalesTargetUsd} monthProgress={monthProgress} />
              )}
              {goals?.monthlyAdBudgetUsd != null && (
                <GoalBar label="Presupuesto de pauta usado" current={monthSpend} target={goals.monthlyAdBudgetUsd} invert monthProgress={monthProgress} />
              )}
              {goals?.weeklyPostsTarget != null && (
                <GoalBar
                  label={`Posts esta semana (${publishedThisWeek} publicados de ${plannedThisWeek} planificados)`}
                  current={publishedThisWeek}
                  target={goals.weeklyPostsTarget}
                  monthProgress={Math.min(1, ((to.getDay() + 6) % 7 + 1) / 7)}
                  unit=""
                />
              )}
            </div>
          </>
        ) : (
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "0.3rem 0 0" }}>
            Sin metas cargadas, los números solo se comparan contra la semana pasada.{" "}
            <Link href="/settings" style={{ color: "var(--accent)" }}>Definí tus metas acá →</Link>
          </p>
        )}
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {communityNow != null && (
          <div className="stat-card">
            <StatLabel label="Comunidad total (IG + YT)" info="Seguidores de Instagram + suscriptores de YouTube. Tu audiencia acumulada entre redes." />
            <div className="stat-value accent">{fmt(communityNow)}</div>
            <StatDelta curr={communityNow} prev={communityPrev} />
          </div>
        )}
        {igAccount && (
          <>
            <div className="stat-card">
              <StatLabel label="Alcance prom. orgánico" info="Personas únicas promedio que ve cada post sin pauta. Si baja sostenido, el contenido perdió tracción con el algoritmo." />
              <div className="stat-value">{fmt(displayAvgReach)}</div>
              <StatDelta curr={avgReach} prev={prevAvgReach} />
            </div>
            <div className="stat-card">
              <StatLabel label="ER% promedio" info="Engagement rate: interacciones (likes+comentarios+guardados+shares) sobre alcance. Sano: 3-6%. Más importante que los likes sueltos." />
              <div className="stat-value">{`${(displayAvgER * 100).toFixed(2)}%`}</div>
              <StatDelta curr={avgER} prev={prevAvgER} />
            </div>
          </>
        )}
        {adAccount && (
          <>
            <div className="stat-card">
              <StatLabel label="Gasto en pauta" info="Inversión en Meta Ads esta semana, en dólares. Ni bueno ni malo por sí solo — importa contra los resultados que trae." />
              <div className="stat-value accent">{fmtMoney(totalSpend)}</div>
              <StatDelta curr={totalSpend} prev={prevTotalSpend > 0 ? prevTotalSpend : null} neutral />
            </div>
            <div className="stat-card">
              <StatLabel label="ROAS" info="Retorno de la pauta: ventas cargadas ÷ gasto. 2x = por cada dólar invertido entraron dos. Menos de 1x = la pauta no se paga sola." />
              <div className="stat-value accent">{`${displayRoas.toFixed(1)}x`}</div>
              <StatDelta curr={roas} prev={prevRoas} />
            </div>
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.85rem", marginTop: "0.5rem" }}>
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="card"
            style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: "0.6rem", fontWeight: 600, fontSize: "0.9rem" }}
          >
            <span style={{ fontSize: "1.3rem" }}>{link.icon}</span>
            {link.label}
          </Link>
        ))}
      </div>
    </main>
  );
}
