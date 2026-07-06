// Terciles de una distribución — "alto" = tercio superior, "bajo" = tercio
// inferior, el resto es "típico". Se ajusta solo a la dispersión real de cada
// métrica, en vez de asumir que todas varían lo mismo con un margen fijo
// (±30%). Compartido entre el diagnóstico de posts orgánicos y el de pauta,
// para que "alto/medio/bajo" signifique lo mismo en toda la app.

export type MetricBand = { median: number; p33: number; p67: number } | null;
export type BmLevel = "top" | "typical" | "low";

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function percentile(sortedAsc: number[], p: number): number {
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

export function band(values: number[]): MetricBand {
  if (values.length < 3) return null; // muestra insuficiente para terciles confiables
  const s = [...values].sort((a, b) => a - b);
  return { median: median(s), p33: percentile(s, 1 / 3), p67: percentile(s, 2 / 3) };
}

// invert=true: menor es mejor (ej. skip rate, CPC, frecuencia)
export function bm(value: number | null, mb: MetricBand, invert = false): BmLevel | undefined {
  if (value == null || !mb || mb.p33 === mb.p67) return undefined;
  if (invert) return value <= mb.p33 ? "top" : value >= mb.p67 ? "low" : "typical";
  return value >= mb.p67 ? "top" : value <= mb.p33 ? "low" : "typical";
}

export const BM_LABEL: Record<BmLevel, string> = { top: "Valor más alto", typical: "Valor típico", low: "Valor más bajo" };
export const BM_COLOR: Record<BmLevel, string> = { top: "#22c55e", typical: "#6b7280", low: "#ef4444" };
