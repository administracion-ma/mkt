import Link from "next/link";

export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "4rem auto", fontFamily: "sans-serif", padding: "0 1rem" }}>
      <h1>Calendario de contenido — Instagram</h1>
      <p>Paso 1: validar la conexión OAuth con tu cuenta de Instagram Business.</p>
      <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
        <a
          href="/api/auth/instagram/start"
          style={{ padding: "0.75rem 1.25rem", background: "#1877F2", color: "#fff", borderRadius: 6, textDecoration: "none" }}
        >
          Conectar Instagram
        </a>
        <a
          href="/api/instagram/test"
          style={{ padding: "0.75rem 1.25rem", background: "#222", color: "#fff", borderRadius: 6, textDecoration: "none" }}
        >
          Probar conexión (followers + posts)
        </a>
        <Link
          href="/calendar"
          style={{ padding: "0.75rem 1.25rem", background: "#0a8f4a", color: "#fff", borderRadius: 6, textDecoration: "none" }}
        >
          Ir al calendario de posts
        </Link>
      </div>
    </main>
  );
}
