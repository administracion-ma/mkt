import Link from "next/link";
import type { AreaHealth } from "@/lib/health";

const LEVEL_COLOR: Record<AreaHealth["level"], string> = {
  good: "#22c55e",
  warn: "#eab308",
  bad: "#ef4444",
  off: "#555",
};
const LEVEL_DOT: Record<AreaHealth["level"], string> = {
  good: "🟢",
  warn: "🟡",
  bad: "🔴",
  off: "⚪",
};

// El "estado del área en 3 segundos": una fila de veredictos por área, cada
// uno clickeable hacia la sección donde está el detalle y la acción.
export function HealthBar({ areas }: { areas: AreaHealth[] }) {
  if (areas.length === 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
      {areas.map((a) => (
        <Link
          key={a.area}
          href={a.href}
          className="card"
          style={{
            textDecoration: "none",
            color: "inherit",
            padding: "0.85rem 1rem",
            borderLeft: `3px solid ${LEVEL_COLOR[a.level]}`,
          }}
        >
          <div style={{ fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            {LEVEL_DOT[a.level]} {a.area}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>{a.text}</div>
        </Link>
      ))}
    </div>
  );
}
