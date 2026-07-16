import { getBrandProfile } from "@/lib/brand/actions";
import { BrandProfileForm } from "@/components/BrandProfileForm";
import { getGoals } from "@/lib/goals/actions";
import { GoalsForm } from "@/components/GoalsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [content, goals] = await Promise.all([getBrandProfile(), getGoals()]);

  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">Ficha de marca</h1>
        <p className="page-subtitle">
          Este texto se le manda a la IA en cada informe y cada pregunta, para que sus respuestas sean específicas de Coinbox y no genéricas.
        </p>
      </div>

      <BrandProfileForm initialContent={content} />

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.3rem" }}>🎯 Metas del área</h2>
        <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", margin: "0 0 1rem" }}>
          Con metas cargadas, el Panel te dice si vas bien o mal contra TU número, no solo contra la semana pasada. Dejá en blanco las que no apliquen.
        </p>
        <GoalsForm initial={goals} />
      </div>
    </main>
  );
}
