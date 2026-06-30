export default function PrivacyPolicy() {
  return (
    <main style={{ maxWidth: 720, margin: "3rem auto", fontFamily: "sans-serif", padding: "0 1rem", lineHeight: 1.6 }}>
      <h1>Política de Privacidad</h1>
      <p>
        Esta aplicación se conecta a la cuenta de Instagram Business propia del
        negocio mediante el inicio de sesión oficial de Meta (OAuth), exclusivamente
        para programar publicaciones y leer estadísticas de las publicaciones hechas
        a través de la aplicación.
      </p>
      <h2>Qué datos accedemos</h2>
      <ul>
        <li>Información básica de la cuenta de Instagram Business conectada (nombre de usuario, cantidad de seguidores).</li>
        <li>Publicaciones creadas a través de esta aplicación y sus métricas (alcance, guardados, compartidos, retención, clics al link de la bio).</li>
      </ul>
      <h2>Qué no hacemos</h2>
      <ul>
        <li>No accedemos a usuario y contraseña de Instagram; el acceso es siempre vía OAuth oficial de Meta.</li>
        <li>No interactuamos con otras cuentas (sin auto-like, auto-follow ni mensajes automáticos).</li>
        <li>No compartimos ni vendemos datos a terceros.</li>
      </ul>
      <h2>Almacenamiento</h2>
      <p>
        Los tokens de acceso se almacenan cifrados. Las métricas se conservan en una
        base de datos propia para análisis histórico, ya que Instagram retiene un
        historial limitado de estadísticas.
      </p>
      <h2>Revocar acceso</h2>
      <p>
        Podés revocar el acceso de esta aplicación en cualquier momento desde la
        configuración de tu cuenta de Meta (Configuración → Seguridad → Apps y sitios web).
      </p>
      <h2>Contacto</h2>
      <p>administracion@coinboxmining.com</p>
    </main>
  );
}
