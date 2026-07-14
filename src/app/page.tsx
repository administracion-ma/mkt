import Link from "next/link";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { adInsights, sales, actionItems } from "@/db/schema";
import { getConnectedAccount } from "@/lib/instagram/account-store";
import { getConnectedAdAccount } from "@/lib/ads/account-store";
import { getAnalyticsRows } from "@/lib/analytics-data";
import { getUsdRate } from "@/lib/fx";
import { ActionItemsList } from "@/components/ActionItemsList";
import { StatDelta } from "@/components/StatDelta";

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
  { href: "/resumenes", icon: "🗂️", label: "Resúmenes" },
];

export default async function HomePage() {
  const [igAccount, adAccount] = await Promise.all([
    getConnectedAccount(),
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

  const [openItems, organicRows, prevOrganicRows, adInsightRows, prevAdInsightRows, periodSales, prevSales, usdRate] = await Promise.all([
    db.query.actionItems.findMany({
      where: eq(actionItems.status, "open"),
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    }),
    igAccount ? getAnalyticsRows(from, to) : Promise.resolve([]),
    igAccount ? getAnalyticsRows(prevFrom, from) : Promise.resolve([]),
    adAccount
      ? db.query.adInsights.findMany({ where: and(gte(adInsights.date, from), lte(adInsights.date, to)) })
      : Promise.resolve([]),
    adAccount
      ? db.query.adInsights.findMany({ where: and(gte(adInsights.date, prevFrom), lte(adInsights.date, from)) })
      : Promise.resolve([]),
    adAccount
      ? db.query.sales.findMany({ where: and(gte(sales.occurredAt, from), lte(sales.occurredAt, to)) }).catch(() => [])
      : Promise.resolve([]),
    adAccount
      ? db.query.sales.findMany({ where: and(gte(sales.occurredAt, prevFrom), lte(sales.occurredAt, from)) }).catch(() => [])
      : Promise.resolve([]),
    adAccount ? getUsdRate(adAccount.currency) : Promise.resolve(null),
  ]);

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
  const totalRevenue = periodSales.reduce((s, r) => s + r.amountUsd, 0);
  const prevRevenue = prevSales.reduce((s, r) => s + r.amountUsd, 0);
  const roas = totalSpend > 0 && periodSales.length > 0 ? totalRevenue / totalSpend : null;
  const prevRoas = prevTotalSpend > 0 && prevSales.length > 0 ? prevRevenue / prevTotalSpend : null;

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

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.85rem" }}>
          🎯 Acciones pendientes{openItems.length > 0 ? ` (${openItems.length})` : ""}
        </h2>
        <ActionItemsList items={openItems} />
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {igAccount && (
          <>
            <div className="stat-card">
              <div className="stat-label">Alcance prom. orgánico</div>
              <div className="stat-value">{fmt(displayAvgReach)}</div>
              <StatDelta curr={avgReach} prev={prevAvgReach} />
            </div>
            <div className="stat-card">
              <div className="stat-label">ER% promedio</div>
              <div className="stat-value">{`${(displayAvgER * 100).toFixed(2)}%`}</div>
              <StatDelta curr={avgER} prev={prevAvgER} />
            </div>
          </>
        )}
        {adAccount && (
          <>
            <div className="stat-card">
              <div className="stat-label">Gasto en pauta</div>
              <div className="stat-value accent">{fmtMoney(totalSpend)}</div>
              <StatDelta curr={totalSpend} prev={prevTotalSpend > 0 ? prevTotalSpend : null} neutral />
            </div>
            <div className="stat-card">
              <div className="stat-label">ROAS</div>
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
