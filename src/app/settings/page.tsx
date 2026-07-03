import { getBrandProfile } from "@/lib/brand/actions";
import { BrandProfileForm } from "@/components/BrandProfileForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const content = await getBrandProfile();

  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">Ficha de marca</h1>
        <p className="page-subtitle">
          Este texto se le manda a la IA en cada informe y cada pregunta, para que sus respuestas sean específicas de Coinbox y no genéricas.
        </p>
      </div>

      <BrandProfileForm initialContent={content} />
    </main>
  );
}
