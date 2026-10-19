"use client";

import { useEffect } from "react";

// Errores típicos de "pestaña abierta de un deploy anterior": los IDs de las
// server actions o los archivos JS cambiaron. No es un error real de la app —
// se arregla recargando la página.
const STALE_DEPLOY_PATTERNS = [
  "was not found on the server",
  "Failed to find Server Action",
  "ChunkLoadError",
  "Loading chunk",
  "Failed to fetch dynamically imported module",
];

const RELOAD_KEY = "mkt-auto-reload-at";

function isStaleDeploy(error: Error) {
  const text = `${error.name} ${error.message}`;
  return STALE_DEPLOY_PATTERNS.some((p) => text.includes(p));
}

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const stale = isStaleDeploy(error);

  useEffect(() => {
    console.error(error);
    if (!stale) return;
    // Recarga una sola vez por minuto como máximo, para no entrar en un loop
    // si por algún motivo el error persiste después de recargar.
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
      if (Date.now() - last < 60_000) return;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      // sessionStorage bloqueado: recargamos igual, una vez.
    }
    window.location.reload();
  }, [error, stale]);

  return (
    <main className="page">
      <div className="card" style={{ marginTop: "2rem", textAlign: "center", padding: "2.5rem 1.5rem" }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>{stale ? "🔄" : "⚠️"}</div>
        <h2 style={{ fontSize: "1.05rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
          {stale ? "Hay una versión nueva de la app" : "Algo falló al cargar esta sección"}
        </h2>
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0 auto 1.25rem", maxWidth: 440 }}>
          {stale
            ? "Recargando para traerla…"
            : "Puede ser algo momentáneo (una API externa lenta o la base de datos despertando). Probá de nuevo — el resto de la app sigue funcionando desde el menú de arriba."}
        </p>
        <div style={{ display: "flex", gap: "0.6rem", justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={() => (stale ? window.location.reload() : unstable_retry())}>
            {stale ? "Recargar ahora" : "Reintentar"}
          </button>
          {!stale && (
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>
              Recargar página
            </button>
          )}
        </div>
        {error.digest && (
          <p style={{ fontSize: "0.68rem", color: "var(--text-tertiary)", marginTop: "1.25rem" }}>Código: {error.digest}</p>
        )}
      </div>
    </main>
  );
}
