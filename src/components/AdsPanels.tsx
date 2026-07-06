import type { DaySpendPoint, CampaignSummary } from "@/lib/ads-insights";

// Mismo dorado validado que el resto de los gráficos (dataviz skill, dark mode)
const MARK = "#CC7508";

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: n >= 1000 ? 0 : 2 })}`;
}
function fmt(n: number | null | undefined): string {
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

export function CampaignTable({ campaigns }: { campaigns: CampaignSummary[] }) {
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
            <th>Estado</th>
            <th className="num">Gasto</th>
            <th className="num">Impresiones</th>
            <th className="num">Clics</th>
            <th className="num">CTR</th>
            <th className="num">CPC</th>
            <th className="num">CPM</th>
            <th className="num">Resultados</th>
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
              <td className="num">{fmtMoney(c.costPerResult)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
