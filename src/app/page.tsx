import { redirect } from "next/navigation";
import { getConnectedAccount } from "@/lib/instagram/account-store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const account = await getConnectedAccount();
  if (account) redirect("/analytics");

  return (
    <main className="page">
      <div className="card" style={{ marginTop: "2rem" }}>
        <div className="connect-cta">
          <div className="connect-cta-icon">📱</div>
          <h2>Conectá tu cuenta de Instagram</h2>
          <p>
            Para programar contenido y ver analíticas necesitás conectar tu cuenta
            de Instagram Business o Creator.
          </p>
          <a href="/api/auth/instagram/start" className="btn btn-primary" style={{ fontSize: "0.95rem", padding: "0.7rem 1.5rem" }}>
            Conectar con Instagram
          </a>
        </div>
      </div>
    </main>
  );
}
