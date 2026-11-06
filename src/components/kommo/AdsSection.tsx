import Link from "next/link";
import { DrillStat } from "@/components/kommo/LeadsDrilldown";
import { AD_LEVELS, QUALITY_MIN_CAPITAL, type AdBreakdown, type AdLevel, type AdRow } from "@/lib/kommo/insights";

// Calidad de las respuestas del bot por anuncio de Meta. Cada número es un
// click que abre la lista de leads (mismo pop-up que el resto de /kommo).

const SMALL_SAMPLE = 30;
const pct = (n: number, total: number) => (total > 0 ? `${((n / total) * 100).toFixed(0)}%` : "—");

function Cell({ n, total, filter, title }: { n: number; total: number; filter: string; title: string }) {
  if (n === 0) return <span style={{ color: "var(--text-tertiary)" }}>0</span>;
  return (
    <DrillStat filter={filter} title={title} block={false}>
      <strong>{n}</strong> <span style={{ color: "var(--text-tertiary)", fontSize: "0.9em" }}>{pct(n, total)}</span>
    </DrillStat>
  );
}

function RowCells({ r, scope, name }: { r: AdRow; scope: string; name: string }) {
  const t = (what: string) => `${name} · ${what}`;
  return (
    <>
      <td className="num">
        <DrillStat filter={scope} title={t("todos los leads")} block={false}>
          <strong>{r.leads}</strong>
        </DrillStat>
      </td>
      <td className="num"><Cell n={r.answered} total={r.leads} filter={`${scope}|answered`} title={t("respondieron interés")} /></td>
      <td className="num"><Cell n={r.acumular} total={r.leads} filter={`${scope}|acumular`} title={t("acumular BTC")} /></td>
      <td className="num"><Cell n={r.cap4k} total={r.leads} filter={`${scope}|cap4k`} title={t("capital de 4.000 USD o más")} /></td>
      <td className="num" style={{ background: "rgba(217, 89, 38, 0.08)" }}>
        <Cell n={r.quality} total={r.leads} filter={`${scope}|quality`} title={t("de calidad (acumular BTC + 4.000 USD o más)")} />
      </td>
      <td className="num"><Cell n={r.qualified} total={r.leads} filter={`${scope}|qualified`} title={t("calificados")} /></td>
      <td className="num"><Cell n={r.won} total={r.leads} filter={`${scope}|won`} title={t("ganados")} /></td>
    </>
  );
}

export function AdsSection({ data, level, levelHref }: { data: AdBreakdown; level: AdLevel; levelHref: (l: AdLevel) => string }) {
  const { rows, baseline, tracked, total } = data;
  const levelLabel = AD_LEVELS.find((l) => l.level === level)?.label ?? "Anuncio";
  return (
    <div className="card" style={{ marginTop: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", flexWrap: "wrap", marginBottom: "0.2rem" }}>
        <h2 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0, flex: 1 }}>📣 Calidad por anuncio (Meta)</h2>
        <div style={{ display: "flex", gap: "0.35rem" }}>
          {AD_LEVELS.map((l) => (
            <Link key={l.level} href={levelHref(l.level)} className={l.level === level ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "0.25rem 0.7rem", fontSize: "0.75rem" }}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
      <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", margin: "0 0 1rem" }}>
        {tracked} de {total} leads del período traen datos de anuncio ({pct(tracked, total)}). &quot;De calidad&quot; = dijo que quiere acumular BTC y tiene {QUALITY_MIN_CAPITAL.toLocaleString("es-AR")} USD o más.
        Los % son sobre los leads de cada fila. Con menos de {SMALL_SAMPLE} leads la comparación todavía no es confiable (se ven atenuadas).
      </p>

      {rows.length === 0 ? (
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: 0 }}>
          Ningún lead de este período trae datos de anuncio. Se empezaron a guardar en noviembre de 2026: ampliá el período para incluirlos.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ fontSize: "0.76rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>{levelLabel}</th>
                <th className="num">Leads</th>
                <th className="num">Respondieron</th>
                <th className="num">Acumular BTC</th>
                <th className="num">Capital ≥ 4k</th>
                <th className="num">De calidad</th>
                <th className="num">Calificados</th>
                <th className="num">Ganados</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} style={r.leads < SMALL_SAMPLE ? { opacity: 0.6 } : undefined}>
                  <td style={{ maxWidth: 320, overflowWrap: "anywhere" }} title={r.label}>{r.label}</td>
                  <RowCells r={r} scope={`${level}:${encodeURIComponent(r.key)}`} name={r.label} />
                </tr>
              ))}
              {baseline.leads > 0 && (
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td style={{ color: "var(--text-secondary)" }}>{baseline.label}</td>
                  <RowCells r={baseline} scope="untracked" name="Sin anuncio" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
