"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButton({ lastSyncAt }: { lastSyncAt: string | null }) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/sync/recent", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error al sincronizar");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
      <span style={{ fontSize: "0.72rem", color: "var(--text-tertiary)" }}>
        {lastSyncAt
          ? `Última sincronización: ${new Date(lastSyncAt).toLocaleString("es-AR", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : "Sin datos sincronizados"}
      </span>
      <button
        onClick={handleSync}
        disabled={syncing}
        style={{
          padding: "0.3rem 0.8rem",
          borderRadius: 8,
          border: "1px solid rgba(249,115,22,0.35)",
          background: syncing ? "rgba(249,115,22,0.08)" : "transparent",
          color: "var(--accent)",
          fontSize: "0.75rem",
          fontWeight: 600,
          cursor: syncing ? "wait" : "pointer",
        }}
      >
        {syncing ? "Sincronizando…" : "↻ Sincronizar ahora"}
      </button>
      {error && <span style={{ fontSize: "0.7rem", color: "var(--danger)" }}>{error}</span>}
      <span
        title="El botón actualiza los 10 posts más recientes al instante. El resto se actualiza automáticamente 3 veces por día."
        style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", cursor: "help" }}
      >
        ⓘ
      </span>
    </div>
  );
}
