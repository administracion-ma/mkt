// Gráfico de torta (dona) en SVG puro — sin librería, se renderiza en el
// servidor. Cada porción lleva su color fijo (el color sigue a la opción, no
// a su posición), un hueco de 2px del color de la card entre porciones, y la
// leyenda al lado repite cantidad y % para que nunca dependa solo del color.

export type DonutSlice = { label: string; count: number; color: string };

const SIZE = 168;
const R_OUTER = 80;
const R_INNER = 52;

function point(r: number, angle: number) {
  // ángulo 0 = arriba, sentido horario
  return [SIZE / 2 + r * Math.sin(angle), SIZE / 2 - r * Math.cos(angle)];
}

function arcPath(start: number, end: number) {
  // Una porción del 100% no se puede dibujar como un solo arco: se corta apenas.
  const sweep = Math.min(end - start, Math.PI * 2 - 0.0001);
  const e = start + sweep;
  const large = sweep > Math.PI ? 1 : 0;
  const [x1, y1] = point(R_OUTER, start);
  const [x2, y2] = point(R_OUTER, e);
  const [x3, y3] = point(R_INNER, e);
  const [x4, y4] = point(R_INNER, start);
  return `M${x1} ${y1} A${R_OUTER} ${R_OUTER} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${R_INNER} ${R_INNER} 0 ${large} 0 ${x4} ${y4} Z`;
}

export function DonutChart({ slices, centerLabel }: { slices: DonutSlice[]; centerLabel: string }) {
  const total = slices.reduce((s, x) => s + x.count, 0);
  const visible = slices.filter((s) => s.count > 0);
  const arcs = visible.map((s, i) => {
    const before = visible.slice(0, i).reduce((acc, x) => acc + x.count, 0);
    const start = (before / total) * Math.PI * 2;
    const end = ((before + s.count) / total) * Math.PI * 2;
    return { ...s, d: arcPath(start, end), pct: (s.count / total) * 100 };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", flexWrap: "wrap" }}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        role="img"
        aria-label={arcs.map((a) => `${a.label}: ${a.pct.toFixed(1)}%`).join(", ")}
        className="donut"
        style={{ flexShrink: 0 }}
      >
        {arcs.map((a) => (
          <path key={a.label} d={a.d} fill={a.color} stroke="var(--surface)" strokeWidth={2}>
            <title>{`${a.label}: ${a.count} (${a.pct.toFixed(1)}%)`}</title>
          </path>
        ))}
        <text x="50%" y="47%" textAnchor="middle" style={{ fontSize: 22, fontWeight: 700, fill: "var(--text)" }}>
          {total}
        </text>
        <text x="50%" y="60%" textAnchor="middle" style={{ fontSize: 10, fill: "var(--text-secondary)" }}>
          {centerLabel}
        </text>
      </svg>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", flex: 1, minWidth: 160 }}>
        {arcs.map((a) => (
          <div key={a.label} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.76rem" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: a.color, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{a.label}</span>
            <span style={{ fontWeight: 700 }}>{a.pct.toFixed(1)}%</span>
            <span style={{ color: "var(--text-secondary)", minWidth: 32, textAlign: "right" }}>{a.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
