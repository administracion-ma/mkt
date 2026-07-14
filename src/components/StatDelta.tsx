// Variación vs período anterior para las stat cards — un número solo no dice
// nada ("¿$100 es mucho?"); la flecha contra el período previo lo convierte
// en señal. Server component, sin estado.

export function pctChange(curr: number | null | undefined, prev: number | null | undefined): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export function StatDelta({
  curr,
  prev,
  invert = false,
  neutral = false,
}: {
  curr: number | null | undefined;
  prev: number | null | undefined;
  invert?: boolean; // menor es mejor (CPC, costo/resultado)
  neutral?: boolean; // ni bueno ni malo (ej: gasto total) — siempre gris
}) {
  const pct = pctChange(curr, prev);
  if (pct == null) return null;

  const arrow = pct > 0.5 ? "↑" : pct < -0.5 ? "↓" : "→";
  const better = invert ? pct < 0 : pct > 0;
  const color =
    neutral || Math.abs(pct) < 1 ? "var(--text-tertiary)" : better ? "#22c55e" : "#ef4444";

  return (
    <div style={{ fontSize: "0.68rem", marginTop: "0.4rem", fontWeight: 600, color }}>
      {arrow} {Math.abs(pct).toFixed(0)}%{" "}
      <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>vs período anterior</span>
    </div>
  );
}
