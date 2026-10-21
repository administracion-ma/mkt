"use client";

import { createContext, useContext, useEffect, useState } from "react";

// Click en una estadística de /kommo → pop-up con los leads que cuenta, cada
// uno con link directo a su tarjeta en Kommo. La página define el período una
// vez (DrillPeriod) y cada número declara su filtro (ver lib/kommo/drilldown).

type Period = { from: string; to: string };
const PeriodContext = createContext<Period | null>(null);

export function DrillPeriod({ from, to, children }: Period & { children: React.ReactNode }) {
  return <PeriodContext.Provider value={{ from, to }}>{children}</PeriodContext.Provider>;
}

type Row = { id: string; name: string; createdAt: string; stage: string; pipeline: string; channel: string; url: string };

// Período "todo el histórico" para los números que no dependen del filtro de fechas.
export const ALL_TIME: Period = { from: "2000-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" };

export function DrillStat({
  filter,
  title,
  children,
  block = true,
  period: periodOverride,
}: {
  filter: string;
  title: string;
  children: React.ReactNode;
  block?: boolean;
  period?: Period;
}) {
  const contextPeriod = useContext(PeriodContext);
  const period = periodOverride ?? contextPeriod;
  const [open, setOpen] = useState(false);
  if (!period) return <>{children}</>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={block ? "drill-trigger drill-block" : "drill-trigger"}
        title="Ver la lista de leads"
        style={{ display: block ? "block" : "inline", width: block ? "100%" : undefined }}
      >
        {children}
      </button>
      {open && <DrillModal period={period} filter={filter} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}

function DrillModal({ period, filter, title, onClose }: { period: Period; filter: string; title: string; onClose: () => void }) {
  const [data, setData] = useState<{ total: number; rows: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    const q = new URLSearchParams({ from: period.from, to: period.to, f: filter });
    fetch(`/api/kommo/leads?${q}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok || !body) throw new Error(body?.error ?? `Error ${res.status}`);
        setData(body);
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      });
    return () => ctrl.abort();
  }, [period.from, period.to, filter]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const rows = (data?.rows ?? []).filter((r) => !q || r.name.toLowerCase().includes(q) || r.id.includes(q));

  return (
    <div className="drill-overlay" onClick={onClose}>
      <div className="drill-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0, flex: 1 }}>
            {title}
            {data && <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}> · {data.total} lead{data.total !== 1 ? "s" : ""}</span>}
          </h3>
          <button type="button" onClick={onClose} className="btn btn-secondary" style={{ padding: "0.3rem 0.7rem" }}>
            Cerrar
          </button>
        </div>

        <input
          className="form-input"
          placeholder="Buscar por nombre o número de lead…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: "0.75rem" }}
          autoFocus
        />

        <div style={{ overflowY: "auto", flex: 1 }}>
          {error ? (
            <p style={{ color: "var(--danger)", fontSize: "0.8rem" }}>No se pudo cargar el listado: {error}</p>
          ) : !data ? (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>Cargando leads…</p>
          ) : rows.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>No hay leads para mostrar.</p>
          ) : (
            <table className="table" style={{ fontSize: "0.76rem" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Lead</th>
                  <th style={{ textAlign: "left" }}>Entró</th>
                  <th style={{ textAlign: "left" }}>Canal</th>
                  <th style={{ textAlign: "left" }}>Etapa actual</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td className="muted">
                      {new Date(r.createdAt).toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="muted">{r.channel}</td>
                    <td className="muted" title={r.pipeline}>{r.stage}</td>
                    <td style={{ textAlign: "right" }}>
                      <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", whiteSpace: "nowrap" }}>
                        Abrir en Kommo ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data && data.total > data.rows.length && (
            <p style={{ color: "var(--text-tertiary)", fontSize: "0.7rem", marginTop: "0.5rem" }}>
              Se muestran los {data.rows.length} más recientes de {data.total}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
