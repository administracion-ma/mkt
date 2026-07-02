import { getBrandProfile, saveBrandProfile } from "@/lib/brand/actions";

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

      <form action={saveBrandProfile} className="card">
        <label>
          <span className="form-label">Contale a la IA sobre el negocio</span>
          <textarea
            name="content"
            defaultValue={content}
            rows={16}
            className="form-input"
            style={{ resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }}
            placeholder="Qué vende Coinbox, quién es el público, qué tono usar, promociones activas…"
          />
        </label>
        <button type="submit" className="btn btn-primary" style={{ marginTop: "1rem" }}>
          Guardar
        </button>
      </form>
    </main>
  );
}
