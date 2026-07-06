"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { login } from "@/lib/auth/actions";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("next", next);
    setError(null);
    startTransition(async () => {
      const result = await login(formData);
      if (result && !result.ok) setError(result.message);
    });
  }

  return (
    <main className="page" style={{ maxWidth: 380, paddingTop: "6rem" }}>
      <div className="card">
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <h1 className="page-title" style={{ marginBottom: "0.3rem" }}>CoinBox Marketing</h1>
          <p className="page-subtitle">Ingresá la contraseña del equipo para entrar</p>
        </div>
        <form onSubmit={handleSubmit} className="form-grid">
          <input
            type="password"
            name="password"
            placeholder="Contraseña"
            className="form-input"
            autoFocus
            required
          />
          <button type="submit" disabled={pending} className="btn btn-primary btn-block">
            {pending ? "Entrando…" : "Entrar"}
          </button>
          {error && <p style={{ color: "var(--danger)", fontSize: "0.82rem", margin: 0 }}>{error}</p>}
        </form>
      </div>
    </main>
  );
}
