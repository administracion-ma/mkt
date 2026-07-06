import { runMigration, runClassification, runFixGraphics } from "@/lib/admin/actions";
import { runAdsSync } from "@/lib/ads/actions";
import { getConnectedAdAccount } from "@/lib/ads/account-store";
import { ActionCard } from "@/components/admin/ActionCard";
import { ConnectAdAccountForm } from "@/components/ConnectAdAccountForm";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const adAccount = await getConnectedAdAccount().catch(() => null);

  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">Administración</h1>
        <p className="page-subtitle">Tareas de mantenimiento — usalas solo cuando te lo pida</p>
      </div>

      <ActionCard
        title="Aplicar migración de base de datos"
        description="Crea tablas y columnas nuevas cuando se agrega una funcionalidad (ej: campos de producción, informes de IA, Meta Ads). Es seguro tocarlo varias veces — no rompe nada si ya estaba aplicado."
        buttonLabel="Aplicar migración"
        action={runMigration}
      />

      <ActionCard
        title="Clasificar posts históricos con IA"
        description="Asigna un pilar de contenido (Labitconf, Granja, Dallas, etc.) a los posts importados de Instagram que todavía no tienen uno, según el caption. Correr después de aplicar la migración."
        buttonLabel="Clasificar con IA"
        action={runClassification}
      />

      <ActionCard
        title="Corregir reels marcados como 'Post gráfico'"
        description="'Post gráfico' es solo para imágenes/diseños estáticos. Esto mueve los reels y videos que quedaron ahí por error a un pilar de tema real."
        buttonLabel="Corregir"
        action={runFixGraphics}
      />

      <ConnectAdAccountForm connectedLabel={adAccount?.label ?? null} />

      {adAccount && (
        <ActionCard
          title="Sincronizar Meta Ads ahora"
          description="Trae campañas y métricas de los últimos 14 días. Corre automáticamente 1 vez por día, usá este botón si necesitás datos más frescos ya mismo."
          buttonLabel="Sincronizar pauta"
          action={runAdsSync}
        />
      )}
    </main>
  );
}
