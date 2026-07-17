export default function PrivacidadGeneral() {
  return (
    <main style={{ maxWidth: 720, margin: "3rem auto", fontFamily: "sans-serif", padding: "0 1rem", lineHeight: 1.6 }}>
      <h1>Política de Privacidad</h1>
      <p>
        Esta aplicación es una herramienta interna de Coinbox Mining para gestionar
        contenido y métricas de sus cuentas oficiales en Instagram, YouTube y TikTok.
        El acceso a cada plataforma se realiza exclusivamente mediante el inicio de
        sesión oficial (OAuth) de cada red social.
      </p>
      <h2>Qué datos accedemos</h2>
      <ul>
        <li>Información básica de las cuentas conectadas (nombre de usuario, cantidad de seguidores).</li>
        <li>Videos y publicaciones creados por la cuenta y sus métricas públicas (vistas, likes, comentarios, compartidos, alcance).</li>
      </ul>
      <h2>Qué no hacemos</h2>
      <ul>
        <li>No accedemos a usuario y contraseña de ninguna red social; el acceso es siempre vía OAuth oficial de cada plataforma.</li>
        <li>No interactuamos con otras cuentas (sin auto-like, auto-follow ni mensajes automáticos).</li>
        <li>No compartimos ni vendemos datos a terceros.</li>
      </ul>
      <h2>Almacenamiento</h2>
      <p>
        Los tokens de acceso se almacenan cifrados. Las métricas se conservan en una
        base de datos propia para análisis histórico interno del equipo de marketing.
      </p>
      <h2>Revocar acceso</h2>
      <p>
        Podés revocar el acceso de esta aplicación en cualquier momento desde la
        configuración de seguridad de tu cuenta en cada red social.
      </p>
      <h2>Contacto</h2>
      <p>administracion@coinboxmining.com</p>
    </main>
  );
}
