"use client";

import { useState, useTransition } from "react";
import { connectAdAccount } from "@/lib/ads/actions";

export function ConnectAdAccountForm({ connectedLabel }: { connectedLabel: string | null }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setResult(null);
    startTransition(async () => {
      const r = await connectAdAccount(formData);
      setResult(r);
    });
  }

  return (
    <div className="card" style={{ marginBottom: "1.25rem" }}>
      <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.3rem" }}>Conectar Meta Ads</h3>
      <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 1rem" }}>
        {connectedLabel
          ? `Cuenta conectada: ${connectedLabel}. Volvé a guardar para cambiarla.`
          : "Solo lectura de métricas — nunca se crean, editan ni pausan campañas desde acá."}
        {" "}Generá un <strong>System User Access Token</strong> con permiso <code>ads_read</code> en
        Meta Business Settings → Usuarios del sistema, y pegalo acá junto con el ID de tu cuenta
        publicitaria (Administrador de anuncios → arriba a la izquierda, formato act_XXXXXXXXX).
      </p>
      <form onSubmit={handleSubmit} className="form-grid">
        <div className="form-row">
          <label>
            <span className="form-label">ID de cuenta publicitaria</span>
            <input type="text" name="adAccountId" placeholder="act_123456789012345" className="form-input" required />
          </label>
          <label>
            <span className="form-label">System User Access Token</span>
            <input type="password" name="accessToken" placeholder="EAAG..." className="form-input" required />
          </label>
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary" style={{ justifySelf: "start" }}>
          {pending ? "Verificando…" : "Conectar"}
        </button>
      </form>
      {result && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem",
            borderRadius: 8,
            background: result.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${result.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            fontSize: "0.78rem",
            color: result.ok ? "#22c55e" : "var(--danger)",
          }}
        >
          {result.ok ? "✓ " : "✕ "}{result.message}
        </div>
      )}
    </div>
  );
}
