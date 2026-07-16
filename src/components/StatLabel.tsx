// Etiqueta de métrica con explicación en criollo (tooltip nativo) — para que
// quien no es de marketing sepa qué mira y qué es "bueno" sin preguntar.
export function StatLabel({ label, info }: { label: string; info: string }) {
  return (
    <div className="stat-label" title={info} style={{ cursor: "help" }}>
      {label} <span style={{ opacity: 0.45, fontSize: "0.85em" }}>ⓘ</span>
    </div>
  );
}
