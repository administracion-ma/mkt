"use client";

import { useEffect } from "react";
import "./globals.css";

const STALE_DEPLOY_PATTERNS = [
  "was not found on the server",
  "Failed to find Server Action",
  "ChunkLoadError",
  "Loading chunk",
  "Failed to fetch dynamically imported module",
];
const RELOAD_KEY = "mkt-auto-reload-at";

// Último recurso: solo se muestra si falla el layout raíz (la barra de
// navegación misma). Los errores dentro de cada sección los atrapa error.tsx
// y no tumban la navegación.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const stale = STALE_DEPLOY_PATTERNS.some((p) => `${error.name} ${error.message}`.includes(p));

  useEffect(() => {
    console.error(error);
    if (!stale) return;
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
      if (Date.now() - last < 60_000) return;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {}
    window.location.reload();
  }, [error, stale]);

  return (
    <html lang="es">
      <body>
        <title>CoinBox Marketing</title>
        <main className="page">
          <div className="card" style={{ marginTop: "3rem", textAlign: "center", padding: "2.5rem 1.5rem" }}>
            <h2 style={{ fontSize: "1.05rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
              {stale ? "Hay una versión nueva de la app — recargando…" : "La app no pudo cargar"}
            </h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0 auto 1.25rem", maxWidth: 440 }}>
              {stale ? "" : "Suele ser momentáneo. Probá de nuevo en unos segundos."}
            </p>
            <div style={{ display: "flex", gap: "0.6rem", justifyContent: "center" }}>
              <button className="btn btn-primary" onClick={() => (stale ? window.location.reload() : unstable_retry())}>
                {stale ? "Recargar ahora" : "Reintentar"}
              </button>
              <button className="btn btn-secondary" onClick={() => (window.location.href = "/")}>
                Ir al inicio
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
