import Link from "next/link";
import { DrillStat } from "@/components/kommo/LeadsDrilldown";
import { AD_LEVELS, QUALITY_MIN_CAPITAL, type AdBreakdown, type AdLevel, type AdRow } from "@/lib/kommo/insights";

// Qué anuncios traen gente que de verdad puede comprar. Una tarjeta por
// campaña / conjunto / anuncio, en lenguaje simple: "de N leads, X son de
// calidad". Cada número abre la lista de leads (mismo pop-up que el resto).

const MIN_FOR_VERDICT = 30; // con menos leads que esto no se compara contra el promedio
const MIN_TO_RANK = 10; // con menos que esto va al final: 1 de 1 no es "100% de calidad"
const QUALITY_COLOR = "#d95926";

const pct = (n: number, total: number) => (total > 0 ? (n / total) * 100 : 0);
const money = QUALITY_MIN_CAPITAL.toLocaleString("es-AR");

// "CM26 | Video Generico 1 | tibio 90d v5 - Copia" → "Video Generico 1 · tibio 90d v5" + detalle "CM26", sin el "- Copia" que agrega Meta.
function splitName(label: string): { title: string; detail: string } {
  const clean = label.replace(/\s*-\s*Copia\s*$/i, "").trim();
  const parts = clean.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return { title: `${parts[1]} · ${parts.slice(2).join(" · ")}`, detail: parts[0] };
  if (parts.length === 2) return { title: parts[1], detail: parts[0] };
  return { title: clean, detail: "" };
}

type Verdict = { text: string; color: string };

function verdictFor(r: AdRow, baselineRate: number | null): Verdict {
  if (r.leads < MIN_TO_RANK) return { text: "Muy pocos leads todavía", color: "var(--text-tertiary)" };
  if (r.leads < MIN_FOR_VERDICT || baselineRate == null) return { text: "Pocos datos para comparar", color: "var(--text-secondary)" };
  const rate = pct(r.quality, r.leads);
  if (baselineRate === 0) return rate > 0 ? { text: "Mejor que el promedio", color: "var(--success)" } : { text: "Igual al promedio", color: "var(--text-secondary)" };
  if (rate >= baselineRate * 1.5) return { text: "Mejor que el promedio", color: "var(--success)" };
  if (rate <= baselineRate * 0.67) return { text: "Peor que el promedio", color: "var(--danger)" };
  return { text: "Parecido al promedio", color: "var(--text-secondary)" };
}

function Chip({ n, label, filter, title }: { n: number; label: string; filter: string; title: string }) {
  const body = (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 0 }}>
      <strong style={{ fontSize: "1rem", fontWeight: 700, color: n === 0 ? "var(--text-tertiary)" : "var(--text)" }}>{n}</strong>
      <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)", lineHeight: 1.25 }}>{label}</span>
    </span>
  );
  return n === 0 ? (
    <div style={{ minWidth: 92 }}>{body}</div>
  ) : (
    <div style={{ minWidth: 92 }}>
      <DrillStat filter={filter} title={title} block={false}>{body}</DrillStat>
    </div>
  );
}

function AdCard({ r, scope, baselineRate, muted }: { r: AdRow; scope: string; baselineRate: number | null; muted?: boolean }) {
  const { title, detail } = splitName(r.label);
  const rate = pct(r.quality, r.leads);
  const verdict = muted ? null : verdictFor(r, baselineRate);
  const t = (what: string) => `${title || r.label} · ${what}`;
  return (
    <div style={{ padding: "1rem 1.1rem", background: "var(--surface2)", borderRadius: 12, borderLeft: `3px solid ${muted ? "var(--border)" : QUALITY_COLOR}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: "1 1 220px" }}>
          <div style={{ fontSize: "0.92rem", fontWeight: 600, overflowWrap: "anywhere" }}>{title || r.label}</div>
          {detail && <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", overflowWrap: "anywhere" }}>{detail}</div>}
        </div>
        {verdict && (
          <span style={{ fontSize: "0.68rem", fontWeight: 600, color: verdict.color, border: `1px solid ${verdict.color}`, borderRadius: 999, padding: "0.1rem 0.6rem", whiteSpace: "nowrap" }}>
            {verdict.text}
          </span>
        )}
      </div>

      <div style={{ margin: "0.85rem 0 0.35rem", fontSize: "0.82rem" }}>
        <DrillStat filter={`${scope}|quality`} title={t("leads de calidad")} block={false}>
          <strong style={{ fontSize: "1.35rem", color: r.quality > 0 ? QUALITY_COLOR : "var(--text-tertiary)" }}>{r.quality}</strong>
        </DrillStat>{" "}
        <span style={{ color: "var(--text-secondary)" }}>
          de <strong style={{ color: "var(--text)" }}>{r.leads}</strong> leads son de calidad
          {r.leads > 0 && ` (${rate.toFixed(0)}%)`}
        </span>
      </div>
      <div style={{ height: 8, background: "var(--surface)", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, rate)}%`, background: QUALITY_COLOR, borderRadius: 6 }} />
      </div>

      <div style={{ display: "flex", gap: "1.1rem", flexWrap: "wrap", marginTop: "0.85rem" }}>
        <Chip n={r.leads} label="escribieron" filter={scope} title={t("todos los leads")} />
        <Chip n={r.answered} label="contestaron qué buscan" filter={`${scope}|answered`} title={t("contestaron la pregunta de interés")} />
        <Chip n={r.acumular} label="quieren acumular Bitcoin" filter={`${scope}|acumular`} title={t("quieren acumular BTC")} />
        <Chip n={r.cap4k} label={`tienen ${money} USD o más`} filter={`${scope}|cap4k`} title={t(`capital de ${money} USD o más`)} />
        <Chip n={r.qualified} label="pasaron a calificado" filter={`${scope}|qualified`} title={t("calificados")} />
        <Chip n={r.won} label="compraron" filter={`${scope}|won`} title={t("ganados")} />
      </div>
    </div>
  );
}

export function AdsSection({ data, level, levelHref }: { data: AdBreakdown; level: AdLevel; levelHref: (l: AdLevel) => string }) {
  const { rows, baseline, tracked, total } = data;
  const baselineRate = baseline.leads > 0 ? pct(baseline.quality, baseline.leads) : null;
  const adLeads = rows.reduce((s, r) => s + r.leads, 0);
  const adQuality = rows.reduce((s, r) => s + r.quality, 0);
  const adRate = adLeads > 0 ? pct(adQuality, adLeads) : null;

  // Los que tienen suficientes leads, de mejor a peor calidad; los muy chicos al final.
  const ranked = [...rows.filter((r) => r.leads >= MIN_TO_RANK)].sort((a, b) => pct(b.quality, b.leads) - pct(a.quality, a.leads) || b.leads - a.leads);
  const small = rows.filter((r) => r.leads < MIN_TO_RANK);

  return (
    <div className="card" style={{ marginTop: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", flexWrap: "wrap", marginBottom: "0.3rem" }}>
        <h2 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0, flex: 1 }}>📣 ¿Qué anuncios traen gente que puede comprar?</h2>
        <div style={{ display: "flex", gap: "0.35rem" }}>
          {AD_LEVELS.map((l) => (
            <Link key={l.level} href={levelHref(l.level)} className={l.level === level ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "0.25rem 0.7rem", fontSize: "0.75rem" }}>
              {l.label === "Anuncio" ? "Por anuncio" : l.label === "Campaña" ? "Por campaña" : "Por conjunto"}
            </Link>
          ))}
        </div>
      </div>
      <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 1rem", lineHeight: 1.5 }}>
        Un <strong style={{ color: QUALITY_COLOR }}>lead de calidad</strong> es alguien que dijo que quiere acumular Bitcoin y tiene {money} USD o más para invertir.
        Cuanto más alta la barra, mejor el anuncio. Tocá cualquier número para ver quiénes son.
      </p>

      {/* Resumen en tres números */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.75rem", marginBottom: "1.1rem" }}>
        <div style={{ padding: "0.7rem 0.9rem", background: "var(--surface2)", borderRadius: 10 }}>
          <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{tracked}<span style={{ fontSize: "0.6em", color: "var(--text-tertiary)", fontWeight: 500 }}> de {total}</span></div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>leads vinieron de un anuncio de Meta ({total > 0 ? pct(tracked, total).toFixed(0) : 0}%)</div>
        </div>
        <div style={{ padding: "0.7rem 0.9rem", background: "var(--surface2)", borderRadius: 10 }}>
          <div style={{ fontSize: "1.3rem", fontWeight: 700, color: QUALITY_COLOR }}>{adRate != null ? `${adRate.toFixed(0)}%` : "—"}</div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>de los leads de anuncios son de calidad ({adQuality} de {adLeads})</div>
        </div>
        <div style={{ padding: "0.7rem 0.9rem", background: "var(--surface2)", borderRadius: 10 }}>
          <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{baselineRate != null ? `${baselineRate.toFixed(0)}%` : "—"}</div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
            de los leads que NO vinieron de un anuncio son de calidad ({baseline.quality} de {baseline.leads}) — es el promedio contra el que comparar
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: 0 }}>
          Ningún lead de este período viene de un anuncio. Esos datos se empezaron a guardar en noviembre de 2026: elegí un período que lo incluya.
        </p>
      ) : (
        <>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {ranked.map((r) => (
              <AdCard key={r.key} r={r} scope={`${level}:${encodeURIComponent(r.key)}`} baselineRate={baselineRate} />
            ))}
          </div>
          {small.length > 0 && (
            <details style={{ marginTop: "0.9rem" }}>
              <summary style={{ cursor: "pointer", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                {small.length} con muy pocos leads (menos de {MIN_TO_RANK}), todavía no se pueden comparar
              </summary>
              <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
                {small.map((r) => (
                  <AdCard key={r.key} r={r} scope={`${level}:${encodeURIComponent(r.key)}`} baselineRate={baselineRate} />
                ))}
              </div>
            </details>
          )}
          <p style={{ fontSize: "0.68rem", color: "var(--text-tertiary)", margin: "0.9rem 0 0", lineHeight: 1.5 }}>
            Ordenados de mayor a menor % de calidad. La etiqueta de cada anuncio lo compara con el promedio de los leads sin anuncio, y recién se anima a opinar con {MIN_FOR_VERDICT} leads o más: con pocos leads una diferencia puede ser pura casualidad.
          </p>
        </>
      )}

      {baseline.leads > 0 && (
        <details style={{ marginTop: "0.75rem" }}>
          <summary style={{ cursor: "pointer", fontSize: "0.78rem", color: "var(--text-secondary)" }}>Ver el detalle de los leads sin anuncio (orgánicos o sin seguimiento)</summary>
          <div style={{ marginTop: "0.75rem" }}>
            <AdCard r={baseline} scope="untracked" baselineRate={baselineRate} muted />
          </div>
        </details>
      )}
    </div>
  );
}
