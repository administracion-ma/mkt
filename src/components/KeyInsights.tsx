import type { KeyInsight } from "@/lib/key-insights";

const TONE_COLOR: Record<KeyInsight["tone"], string> = {
  good: "#22c55e",
  warn: "#eab308",
  bad: "#ef4444",
  neutral: "var(--accent)",
};

export function KeyInsights({ insights }: { insights: KeyInsight[] }) {
  if (insights.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "0 0 0.2rem" }}>Puntos clave</h3>
      <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", margin: "0 0 1rem" }}>
        Lecturas automáticas del período elegido — sin IA, para tener una conclusión al toque.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {insights.map((insight, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: "0.65rem",
              alignItems: "flex-start",
              padding: "0.6rem 0.75rem",
              borderRadius: 10,
              background: "var(--surface2)",
              borderLeft: `3px solid ${TONE_COLOR[insight.tone]}`,
            }}
          >
            <span style={{ fontSize: "1rem", lineHeight: 1.3 }}>{insight.icon}</span>
            <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              {insight.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
