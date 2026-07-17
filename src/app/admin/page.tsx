import { runMigration, runClassification, runFixGraphics } from "@/lib/admin/actions";
import { runAdsSync } from "@/lib/ads/actions";
import { getConnectedAdAccount } from "@/lib/ads/account-store";
import { runYoutubeSync, runYoutubeImport } from "@/lib/youtube/actions";
import { getConnectedYoutubeAccount } from "@/lib/youtube/account-store";
import { runTiktokSync } from "@/lib/tiktok/actions";
import { getConnectedTiktokAccount } from "@/lib/tiktok/account-store";
import { ActionCard } from "@/components/admin/ActionCard";
import { ConnectAdAccountForm } from "@/components/ConnectAdAccountForm";

export const dynamic = "force-dynamic";
// Las server actions de esta página (sincronizar YouTube/Ads, clasificar,
// importar) hacen muchas llamadas a APIs externas — heredan este límite,
// igual que las rutas pesadas de IA (300s). Sin esto las mata el default.
export const maxDuration = 300;

export default async function AdminPage() {
  const [adAccount, youtubeAccount, tiktokAccount] = await Promise.all([
    getConnectedAdAccount().catch(() => null),
    getConnectedYoutubeAccount().catch(() => null),
    getConnectedTiktokAccount().catch(() => null),
  ]);

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
          description="Trae campañas y métricas de los últimos 90 días. Corre automáticamente 1 vez por día, usá este botón si necesitás datos más frescos ya mismo."
          buttonLabel="Sincronizar pauta"
          action={runAdsSync}
        />
      )}

      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.3rem" }}>Conectar YouTube</h3>
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 1rem" }}>
          {youtubeAccount
            ? `Canal conectado: ${youtubeAccount.channelTitle}. Volvé a conectar para cambiarlo.`
            : "Conectá el canal de YouTube de Coinbox con tu cuenta de Google para programar videos y ver sus métricas."}
        </p>
        <a href="/api/auth/youtube/start" className="btn btn-primary">Conectar con YouTube</a>
      </div>

      {youtubeAccount && (
        <>
          <ActionCard
            title="Importar videos existentes de YouTube"
            description="Trae el historial de videos que ya están subidos al canal (aunque no se hayan publicado desde esta app) para poder ver sus métricas acá. Correr una vez después de conectar; es seguro repetirlo, no duplica."
            buttonLabel="Importar videos"
            action={runYoutubeImport}
          />
          <ActionCard
            title="Sincronizar YouTube ahora"
            description="Trae vistas, likes y comentarios de los videos publicados, y el conteo de suscriptores del canal. Corre automáticamente 1 vez por día, usá este botón si necesitás datos más frescos ya mismo."
            buttonLabel="Sincronizar YouTube"
            action={runYoutubeSync}
          />
        </>
      )}

      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.3rem" }}>Conectar TikTok</h3>
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 1rem" }}>
          {tiktokAccount
            ? `Cuenta conectada: ${tiktokAccount.displayName}. Volvé a conectar para cambiarla.`
            : "Conectá la cuenta de TikTok de Coinbox para programar videos y ver sus métricas. Mientras la app no esté auditada por TikTok, lo que se publique desde acá sale privado (solo vos lo ves)."}
        </p>
        <a href="/api/auth/tiktok/start" className="btn btn-primary">Conectar con TikTok</a>
      </div>

      {tiktokAccount && (
        <ActionCard
          title="Sincronizar TikTok ahora"
          description="Trae videos nuevos publicados directo en TikTok, sus vistas/likes/comentarios/shares, y el conteo de seguidores. Corre automáticamente 1 vez por día, usá este botón si necesitás datos más frescos ya mismo."
          buttonLabel="Sincronizar TikTok"
          action={runTiktokSync}
        />
      )}
    </main>
  );
}
