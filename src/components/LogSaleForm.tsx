"use client";

import { useRef, useState, useTransition } from "react";
import { logSale } from "@/lib/sales/actions";

export function LogSaleForm({ campaigns }: { campaigns: { campaignId: number; name: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setResult(null);
    startTransition(async () => {
      const r = await logSale(formData);
      setResult(r);
      if (r.ok) formRef.current?.reset();
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="form-grid">
      <div className="form-row">
        <label>
          <span className="form-label">Monto (USD)</span>
          <input type="number" name="amountUsd" step="0.01" min="0" placeholder="1500" className="form-input" required />
        </label>
        <label>
          <span className="form-label">Fecha</span>
          <input type="date" name="occurredAt" defaultValue={today} className="form-input" required />
        </label>
      </div>
      <div className="form-row">
        <label>
          <span className="form-label">Campaña (opcional)</span>
          <select name="campaignId" className="form-input">
            <option value="">Sin asignar</option>
            {campaigns.map((c) => (
              <option key={c.campaignId} value={c.campaignId}>{c.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="form-label">Nota (opcional)</span>
          <input type="text" name="note" placeholder="Ej: venta ASIC modelo X" className="form-input" />
        </label>
      </div>
      <button type="submit" disabled={pending} className="btn btn-primary" style={{ justifySelf: "start" }}>
        {pending ? "Guardando…" : "Registrar venta"}
      </button>
      {result && (
        <p style={{ fontSize: "0.78rem", color: result.ok ? "#22c55e" : "var(--danger)", margin: 0 }}>
          {result.ok ? "✓ " : "✕ "}{result.message}
        </p>
      )}
    </form>
  );
}
