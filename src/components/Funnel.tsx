// El embudo del negocio: Alcance → Visitas al perfil → Mensajes → Ventas.
// Muestra dónde está la fuga: si nadie te ve es contenido; si te ven pero no
// escriben es oferta/CTA; si escriben pero no compran es venta, no marketing.

function fmt(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function conv(num: number | null, denom: number | null): string | null {
  if (num == null || denom == null || denom <= 0) return null;
  const pct = (num / denom) * 100;
  return pct >= 10 ? `${pct.toFixed(0)}%` : `${pct.toFixed(1)}%`;
}

function Stage({ label, value, sub, info }: { label: string; value: string; sub?: string | null; info: string }) {
  return (
    <div style={{ flex: 1, minWidth: 130, textAlign: "center", padding: "0.75rem 0.5rem", background: "var(--surface2)", borderRadius: 10 }} title={info}>
      <div style={{ fontSize: "1.35rem", fontWeight: 800, letterSpacing: "-0.03em" }}>{value}</div>
      <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "0.2rem" }}>{label}</div>
      {sub && <div style={{ fontSize: "0.68rem", color: "var(--text-tertiary)", marginTop: "0.15rem" }}>{sub}</div>}
    </div>
  );
}

function Arrow({ pct }: { pct: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 0.25rem", flexShrink: 0 }}>
      <span style={{ color: "var(--text-tertiary)", fontSize: "1rem" }}>→</span>
      {pct && <span style={{ fontSize: "0.65rem", color: "var(--accent)", fontWeight: 700 }}>{pct}</span>}
    </div>
  );
}

export function Funnel({
  reach, profileVisits, messages, salesCount, revenue,
}: {
  reach: number | null;
  profileVisits: number | null;
  messages: number | null;
  salesCount: number;
  revenue: number;
}) {
  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <h2 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "0 0 0.2rem" }}>🔻 Embudo (últimos 7 días)</h2>
      <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", margin: "0 0 1rem" }}>
        Dónde se pierde la gente: si el 1er salto es bajo, es problema de contenido; el 2do, de oferta/llamado a la acción; el 3ro, de cierre de venta.
      </p>
      <div style={{ display: "flex", alignItems: "stretch", gap: "0.25rem", flexWrap: "wrap" }}>
        <Stage label="Alcance IG" value={fmt(reach)} info="Personas únicas que vieron tu contenido orgánico de Instagram esta semana." />
        <Arrow pct={conv(profileVisits, reach)} />
        <Stage label="Visitas al perfil" value={fmt(profileVisits)} info="Cuántos, después de ver un post, entraron a tu perfil — interés real." />
        <Arrow pct={conv(messages, profileVisits)} />
        <Stage label="Mensajes (pauta)" value={fmt(messages)} sub="solo de anuncios" info="Conversaciones iniciadas desde anuncios de Meta. Los DMs orgánicos no los da la API." />
        <Arrow pct={conv(salesCount, messages)} />
        <Stage label="Ventas" value={String(salesCount)} sub={revenue > 0 ? `$${revenue.toLocaleString("es-AR", { maximumFractionDigits: 0 })}` : "cargalas en Meta Ads"} info="Ventas cargadas a mano en la sección Meta Ads." />
      </div>
    </div>
  );
}
