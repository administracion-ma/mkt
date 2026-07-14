import type { DaySpendPoint, CampaignSummary, MonthPoint, UnifiedPillarRow } from "@/lib/ads-insights";
import { PillarAssignSelect } from "./PillarAssignSelect";

// Mismo dorado validado que el resto de los gráficos (dataviz skill, dark mode)
const MARK = "#CC7508";

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: n >= 1000 ? 0 : 2 })}`;
}
export function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function PanelTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: "0.9rem" }}>
      <h3 style={{ fontSize: "0.82rem", fontWeight: 600, margin: 0, color: "var(--text)" }}>{children}</h3>
      {hint && <p style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", margin: "0.2rem 0 0" }}>{hint}</p>}
    </div>
  );
}

// ── Inversión diaria ──────────────────────────────────────────────────────────
export function AdSpendChart({ points }: { points: DaySpendPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="card">
        <PanelTitle>Inversión diaria</PanelTitle>
        <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
          Se necesitan al menos 2 días con datos para dibujar la tendencia.
        </p>
      </div>
    );
  }

  const W = 640, H = 240, PAD_B = 28, PAD_T = 28, PAD_L = 4;
  const max = Math.max(...points.map((p) => p.spend), 1);
  const barGap = points.length > 20 ? 1 : points.length > 10 ? 2 : 4;
  const barW = Math.max(3, Math.floor((W - PAD_L) / points.length) - barGap);
  const maxIdx = points.findIndex((p) => p.spend === max);
  const showEveryLabel = points.length <= 10;

  return (
    <div className="card">
      <PanelTitle hint={`Gasto por día · ${points.length} día${points.length !== 1 ? "s" : ""} del período elegido`}>
        Inversión diaria
      </PanelTitle>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 640, display: "block" }} role="img" aria-label="Inversión diaria">
        {[0, 0.5, 1].map((f) => {
          const y = H - PAD_B - (H - PAD_B - PAD_T) * f;
          return (
            <g key={f}>
              <line x1={PAD_L} y1={y} x2={W} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
              <text x={PAD_L} y={y - 4} fontSize={10} fill="var(--text-tertiary)">{fmtMoney(max * f)}</text>
            </g>
          );
        })}
        {points.map((p, i) => {
          const x = PAD_L + i * (barW + barGap);
          const h = Math.max(2, ((H - PAD_B - PAD_T) * p.spend) / max);
          const y = H - PAD_B - h;
          const label = new Date(p.date + "T00:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "numeric" });
          const isMax = i === maxIdx;
          return (
            <g key={p.date}>
              <rect x={x} y={y} width={barW} height={h} rx={2} fill={isMax ? "var(--accent)" : MARK}>
                <title>{`${label}: ${fmtMoney(p.spend)} · ${fmt(p.impressions)} impresiones · ${p.clicks} clics`}</title>
              </rect>
              {isMax && (
                <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize={10} fill="var(--text)" fontWeight={700}>
                  {fmtMoney(p.spend)}
                </text>
              )}
              {(showEveryLabel || i % Math.ceil(points.length / 8) === 0) && (
                <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={9} fill="var(--text-tertiary)">
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Tabla de campañas ─────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "#22c55e",
  PAUSED: "#eab308",
  ARCHIVED: "#6b7280",
  DELETED: "#ef4444",
};
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Activa",
  PAUSED: "Pausada",
  ARCHIVED: "Archivada",
  DELETED: "Eliminada",
};

export function CampaignTable({ campaigns, pillars }: { campaigns: CampaignSummary[]; pillars: { id: number; label: string }[] }) {
  if (campaigns.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">📢</div>
        <p>No hay campañas con datos en este período.</p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            <th>Campaña</th>
            <th>Pilar</th>
            <th>Estado</th>
            <th className="num">Gasto</th>
            <th className="num">Impresiones</th>
            <th className="num">Clics</th>
            <th className="num">CTR</th>
            <th className="num">CPC</th>
            <th className="num">CPM</th>
            <th className="num">Resultados</th>
            <th className="num">Mensajes</th>
            <th className="num">Costo/resultado</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.campaignId}>
              <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.name}>
                {c.name}
              </td>
              <td>
                <PillarAssignSelect campaignId={c.campaignId} pillarId={c.pillarId} pillars={pillars} />
              </td>
              <td>
                {c.status && (
                  <span style={{
                    fontSize: "0.68rem", fontWeight: 700, color: STATUS_COLOR[c.status] ?? "var(--text-secondary)",
                    background: `${STATUS_COLOR[c.status] ?? "#6b7280"}18`, padding: "0.15rem 0.5rem", borderRadius: 20,
                  }}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                )}
              </td>
              <td className="num">{fmtMoney(c.spend)}</td>
              <td className="num">{fmt(c.impressions)}</td>
              <td className="num">{fmt(c.clicks)}</td>
              <td className="num">{c.ctr != null ? `${c.ctr.toFixed(2)}%` : "—"}</td>
              <td className="num">{fmtMoney(c.cpc)}</td>
              <td className="num">{fmtMoney(c.cpm)}</td>
              <td className="num">{c.results || "—"}</td>
              <td className="num">{c.messages || "—"}</td>
              <td className="num">{fmtMoney(c.costPerResult)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Orgánico + pauta por pilar ─────────────────────────────────────────────────
export function UnifiedPillarTable({ rows }: { rows: UnifiedPillarRow[] }) {
  if (rows.length === 0) {
    return (
      <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
        Todavía no hay ninguna campaña asignada a un pilar, o no hay posts orgánicos clasificados en este período.
      </p>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            <th>Pilar</th>
            <th className="num">Posts IG</th>
            <th className="num">Alcance IG</th>
            <th className="num">ER IG</th>
            <th className="num">Videos YT</th>
            <th className="num">Vistas YT (med.)</th>
            <th className="num">Gasto pauta</th>
            <th className="num">Resultados pauta</th>
            <th className="num">Costo/resultado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.pillarId}>
              <td style={{ fontWeight: 600 }}>{r.label}</td>
              <td className="num">{r.organicPosts || "—"}</td>
              <td className="num">{fmt(r.organicReach)}</td>
              <td className="num">{r.organicEr != null ? `${(r.organicEr * 100).toFixed(1)}%` : "—"}</td>
              <td className="num">{r.ytVideos || "—"}</td>
              <td className="num">{fmt(r.ytViewsMedian)}</td>
              <td className="num" style={{ color: r.paidSpend > 0 ? "var(--accent)" : undefined }}>{r.paidSpend > 0 ? fmtMoney(r.paidSpend) : "—"}</td>
              <td className="num">{r.paidResults || "—"}</td>
              <td className="num">{fmtMoney(r.paidCostPerResult)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Mini barras mensuales (para "¿algún mes empeoró?") ────────────────────────
export function MiniMonthBars({
  points, label, color, formatValue, formatLabel,
}: {
  points: MonthPoint[];
  label: string;
  color: string;
  formatValue: (p: MonthPoint) => number;
  formatLabel?: (v: number) => string;
}) {
  const withData = points.filter((p) => formatValue(p) > 0);
  if (withData.length < 2) return null;

  const fmtLabel = formatLabel ?? ((v: number) => v.toLocaleString("es-AR"));
  const W = 400, H = 130, PAD_B = 20, PAD_T = 24;
  const max = Math.max(...points.map(formatValue), 1);
  const barGap = 10;
  const barW = Math.max(8, Math.floor(W / points.length) - barGap);

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <div style={{ fontSize: "0.68rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
        {label} por mes
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 400, display: "block" }} role="img" aria-label={`${label} por mes`}>
        {points.map((p, i) => {
          const val = formatValue(p);
          const x = i * (barW + barGap);
          const h = Math.max(2, ((H - PAD_B - PAD_T) * val) / max);
          const y = H - PAD_B - h;
          const monthLabel = new Date(`${p.month}-01T00:00:00`).toLocaleDateString("es-AR", { month: "short" });
          return (
            <g key={p.month}>
              <rect x={x} y={y} width={barW} height={h} rx={2} fill={color}>
                <title>{`${monthLabel}: ${fmtLabel(val)}`}</title>
              </rect>
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--text)">
                {fmtLabel(val)}
              </text>
              <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--text-tertiary)">
                {monthLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Tabla mensual con variación mes a mes ─────────────────────────────────────
// El diagnóstico real de "¿empeoró?" no es el gasto (eso lo controlás vos),
// es el costo/resultado y el CTR — por eso se resalta la variación de esos dos.
function pctChange(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function DeltaBadge({ pct, invert }: { pct: number | null; invert?: boolean }) {
  if (pct == null || Math.abs(pct) < 1) return <span style={{ color: "var(--text-tertiary)" }}>—</span>;
  const isImprovement = invert ? pct < 0 : pct > 0;
  const color = isImprovement ? "#22c55e" : "#ef4444";
  const arrow = pct > 0 ? "▲" : "▼";
  return <span style={{ color, fontWeight: 700 }}>{arrow} {Math.abs(pct).toFixed(0)}%</span>;
}

export function MonthlyTrendTable({ months }: { months: MonthPoint[] }) {
  if (months.length < 2) return null;

  return (
    <div style={{ overflowX: "auto", marginTop: "1rem" }}>
      <table className="table">
        <thead>
          <tr>
            <th>Mes</th>
            <th className="num">Gasto</th>
            <th className="num">Resultados</th>
            <th className="num">Costo/result.</th>
            <th className="num">vs. mes ant.</th>
            <th className="num">CTR</th>
            <th className="num">vs. mes ant.</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m, i) => {
            const prev = i > 0 ? months[i - 1] : null;
            const monthLabel = new Date(`${m.month}-01T00:00:00`).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
            return (
              <tr key={m.month}>
                <td style={{ textTransform: "capitalize" }}>{monthLabel}</td>
                <td className="num">{fmtMoney(m.spend)}</td>
                <td className="num">{m.results || "—"}</td>
                <td className="num">{fmtMoney(m.costPerResult)}</td>
                <td className="num">{prev ? <DeltaBadge pct={pctChange(m.costPerResult, prev.costPerResult)} invert /> : "—"}</td>
                <td className="num">{m.ctr != null ? `${m.ctr.toFixed(2)}%` : "—"}</td>
                <td className="num">{prev ? <DeltaBadge pct={pctChange(m.ctr, prev.ctr)} /> : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
