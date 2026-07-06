import { db } from "@/db/client";

export const dynamic = "force-dynamic";

type ReportItem = {
  id: number;
  type: "organic" | "ads";
  periodFrom: Date;
  periodTo: Date;
  summary: string;
  createdAt: Date;
};

const TYPE_LABEL: Record<ReportItem["type"], string> = { organic: "📷 Instagram", ads: "📢 Meta Ads" };
const TYPE_COLOR: Record<ReportItem["type"], string> = { organic: "#a855f7", ads: "var(--accent)" };

export default async function ResumenesPage() {
  const [organicReports, adsReports] = await Promise.all([
    db.query.analysisReports.findMany({ orderBy: (r, { desc }) => [desc(r.createdAt)] }),
    db.query.adAnalysisReports.findMany({ orderBy: (r, { desc }) => [desc(r.createdAt)] }).catch(() => []),
  ]);

  const items: ReportItem[] = [
    ...organicReports.map((r) => ({ ...r, type: "organic" as const })),
    ...adsReports.map((r) => ({ ...r, type: "ads" as const })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">Resúmenes</h1>
        <p className="page-subtitle">Historial de informes de IA — Instagram orgánico y Meta Ads, uno por semana</p>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">🗂️</div>
            <p>Todavía no se generó ningún informe. Se generan solos cada lunes, o podés forzarlos con &quot;Analizar&quot; en Analítica o Meta Ads.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {items.map((item) => {
            const period = `${item.periodFrom.toLocaleDateString("es-AR", { day: "numeric", month: "short" })} → ${item.periodTo.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}`;
            const color = TYPE_COLOR[item.type];
            return (
              <details key={`${item.type}-${item.id}`} className="card" style={{ padding: 0 }}>
                <summary
                  style={{
                    padding: "1rem 1.5rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.75rem",
                    flexWrap: "wrap", listStyle: "none",
                  }}
                >
                  <span style={{
                    fontSize: "0.68rem", fontWeight: 700, color, background: `${color}18`,
                    padding: "0.15rem 0.55rem", borderRadius: 20, whiteSpace: "nowrap",
                  }}>
                    {TYPE_LABEL[item.type]}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{period}</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", marginLeft: "auto" }}>
                    {item.createdAt.toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </summary>
                <div className="prose" style={{ padding: "0 1.5rem 1.25rem", whiteSpace: "pre-wrap", fontSize: "0.85rem", lineHeight: 1.65, color: "var(--text-secondary)" }}>
                  {item.summary}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </main>
  );
}
