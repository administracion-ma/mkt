# CoinBox Marketing

Dashboard interno de Coinbox Mining para gestionar contenido orgánico (Instagram, YouTube, TikTok), pauta (Meta Ads), el CRM de ventas (Kommo) y el calendario de producción, con informes automáticos generados por IA (Claude/Anthropic).

Next.js 16 (App Router) + TypeScript + Drizzle ORM + Postgres (Supabase).

---

## 1. Correr en desarrollo

```bash
npm install
cp .env.example .env.local   # completar con los valores reales (ver sección 3)
npm run dev
```

Abre en `http://localhost:3000`.

Chequeos antes de cualquier commit:

```bash
npx tsc --noEmit   # tiene que quedar sin errores
npx eslint .        # 0 errores (hay 4 warnings de <img> conocidos y aceptados)
```

---

## 2. Base de datos

Postgres en Supabase, accedido vía el **pooler en modo "Transaction"** (puerto `6543`, NO el `5432` de conexión directa — con varias funciones serverless concurrentes el directo se agota y la app empieza a tirar `504`).

Las tablas se crean/actualizan con una migración propia (no usamos `drizzle-kit push` en producción, es más predecible así):

- **UI**: entrar a `/admin` → botón "Aplicar migración". Es **idempotente**, seguro correr varias veces.
- **CLI**: `npm run db:push` aplica el schema de Drizzle directo (usado por el workflow `db-push.yml`, pensado más para desarrollo/emergencias que para el flujo normal).
- El código de la migración vive en `src/lib/admin/migrate.ts` — crea tablas con `CREATE TABLE IF NOT EXISTS` e índices con `CREATE INDEX IF NOT EXISTS`.

Cada vez que se agrega una tabla/columna nueva al `schema.ts`, hay que sumar el `CREATE TABLE`/`ALTER` correspondiente ahí y correr "Aplicar migración" en producción.

---

## 3. Variables de entorno

Ver `.env.example` para la lista completa con comentarios de dónde sacar cada una. Resumen por integración:

| Integración | Variables | De dónde se saca |
|---|---|---|
| Base de datos | `DATABASE_URL` | Supabase → Connect → pooler modo Transaction |
| Instagram/Meta | `META_APP_ID`, `META_APP_SECRET`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `META_REDIRECT_URI` | developers.facebook.com |
| YouTube | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI` | Google Cloud Console (OAuth 2.0 Client) |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI` | developers.tiktok.com |
| Kommo (CRM) | `KOMMO_SUBDOMAIN`, `KOMMO_ACCESS_TOKEN` | Kommo → Integraciones → Integración privada → token de larga duración (sin OAuth) |
| Subida de video | `BLOB_READ_WRITE_TOKEN` | Vercel Blob — **ver sección 6**, es lo único atado de verdad a Vercel |
| Seguridad | `TOKEN_ENCRYPTION_KEY` | generar con `openssl rand -hex 32` |
| IA | `ANTHROPIC_API_KEY` | console.anthropic.com |
| Email (opcional) | `RESEND_API_KEY`, `NOTIFY_EMAIL_TO` | resend.com — si no se configura, la app funciona igual sin mandar recordatorios por mail |

Todas las redirect URI de OAuth (Meta/YouTube/TikTok) tienen que coincidir EXACTO (protocolo + dominio + path) con lo cargado en el panel de desarrollador de cada plataforma. Si cambia el dominio de hosting, hay que actualizar las 3.

---

## 4. Automatizaciones (GitHub Actions)

Todos los cron jobs viven en `.github/workflows/` y corren **fuera del hosting** (en GitHub, no en Vercel/Netlify/etc.) — necesitan sus propias copias de las env vars relevantes como *Secrets* del repo (Settings → Secrets and variables → Actions), independientes de las del hosting.

| Workflow | Cuándo | Qué hace |
|---|---|---|
| `publish-scheduled-posts.yml` | cada 15 min | Publica posts de Instagram cuya hora programada llegó |
| `publish-scheduled-youtube.yml` | cada 15 min | Publica videos de YouTube programados |
| `publish-scheduled-tiktok.yml` | cada 15 min | Publica videos de TikTok programados |
| `sync-post-metrics.yml` | 3 veces/día | Trae métricas de posts de Instagram + descubre posts publicados fuera de la app |
| `sync-ads.yml` | diario 9am | Trae campañas y métricas de Meta Ads |
| `sync-youtube.yml` | diario 10am | Trae métricas de videos + descubre videos publicados fuera de la app |
| `sync-tiktok.yml` | diario 11am | Trae métricas de videos + descubre videos publicados fuera de la app |
| `sync-kommo.yml` | diario 12pm | Trae leads del CRM (últimos ~13 meses) |
| `refresh-token.yml` | lunes 9am | Renueva el token de Instagram antes de que expire |
| `weekly-report.yml` | lunes 11am | Genera el informe semanal con IA |
| `db-push.yml` | manual | Aplica el schema de Drizzle directo (uso excepcional) |
| `import-instagram-history.yml` | manual | Importa el historial completo de Instagram (una sola vez, al dar de alta la cuenta) |

---

## 5. Estructura del código

```
src/
  app/                  rutas (App Router) — una carpeta por sección: /, /calendar, /analytics,
                         /ads, /youtube, /tiktok, /kommo, /resumenes, /settings, /admin
  app/api/              rutas de API: OAuth callbacks, subida de blobs, informes de IA, diagnóstico
  components/           componentes de UI, organizados por sección
  lib/{plataforma}/      por cada integración (instagram, youtube, tiktok, ads, kommo):
                         oauth.ts (si aplica), account-store.ts, api.ts, publish.ts, sync.ts, actions.ts
                         — mismo patrón en las 5, así las funciones se comparten entre las rutas
                         web (botones) y los scripts de cron sin duplicar nada.
  db/                   schema.ts (Drizzle) + client.ts (conexión a Postgres)
scripts/                 wrappers finitos que llaman a lib/{plataforma}/sync.ts — son lo que
                         ejecutan los GitHub Actions
```

---

## 6. Dependencias específicas de Vercel (si se cambia de hosting)

La app hoy corre en Vercel. La mayor parte es Next.js estándar y debería andar en cualquier hosting con soporte para Next.js (Netlify, Railway, un VPS propio, etc.), **excepto por esto**:

### Subida de video (`@vercel/blob`)
`src/app/api/youtube/blob-upload/route.ts`, `src/app/api/tiktok/blob-upload/route.ts`, y el `upload()` client-side en `YoutubeVideoForm.tsx`/`TiktokVideoForm.tsx` usan **Vercel Blob**, un producto propio de Vercel — no existe fuera de ahí. Es así porque los videos pesan mucho más que el límite de 1MB de un Server Action, así que se suben directo del navegador al storage (el servidor solo emite un token de subida de un solo uso).

**Recomendación al migrar**: reemplazar por **Supabase Storage** (ya se usa Supabase para la base de datos, no suma un proveedor nuevo) con el mismo patrón de dos pasos:
1. El servidor genera una URL de subida firmada: `supabase.storage.from('videos').createSignedUploadUrl(path)` (requiere la Service Role Key, no la pública).
2. El cliente sube el archivo directo a esa URL con `uploadToSignedUrl()`.

El bucket debe crearse público (mismo criterio que hoy: `access: "public"` en Vercel Blob) porque el servidor necesita poder leer el archivo de vuelta para subirlo a YouTube, y TikTok lo descarga directo de la URL (`PULL_FROM_URL`).

### `maxDuration` (límite de tiempo de función)
`layout.tsx` (30s) y `admin/page.tsx` (300s) usan la [route segment config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#maxduration) de Next.js. En Vercel esto extiende el timeout de la función serverless. **Otros hosts tienen límites y sintaxis propios** (Netlify, por ejemplo, maneja esto distinto y los planes gratuitos suelen tener topes más bajos) — revisar que la plataforma elegida soporte al menos ~300s para los botones de sincronización de `/admin`, que hacen varias llamadas secuenciales a APIs externas. Si el nuevo host no lo soporta, esos botones van a necesitar rearmarse (ej: colas en vez de ejecución síncrona).

### Nada más depende de Vercel
No hay `vercel.json`, no se usa Vercel KV/Edge Config/Cron (los cron jobs son GitHub Actions, portables por diseño), y la base de datos ya es Supabase (independiente del hosting).

---

## 7. Limitaciones conocidas / pendientes

- **Datos de relleno en el Panel** (`src/app/page.tsx`, buscar `DEMO_FANTASIA`): algunas stat cards muestran un valor de relleno SOLO visual cuando todavía no hay data real, para que el panel no se vea vacío en una demo. No afecta cálculos reales ni informes de IA. Sacar cuando ya no haga falta para demos (buscar el string `DEMO_FANTASIA` en el código).
- **Kommo no está cruzado con Meta Ads todavía**: la idea a futuro es saber de qué anuncio vino cada lead (UTMs → Kommo), pero ese tracking del lado de Kommo no está funcionando aún (fuera del alcance de este repo). El dashboard de `/kommo` funciona standalone mientras tanto.
- **El embudo de `/kommo` es de estado ACTUAL, no de cohorte histórico**: muestra en qué etapa está hoy cada lead que entró en el período, no por dónde pasó a lo largo del tiempo (eso requeriría la API de eventos de Kommo, no implementada).
- **TikTok sale privado hasta que la app pase la auditoría de TikTok**: mientras la app no esté auditada, todo lo publicado vía API sale `SELF_ONLY` (restricción de TikTok, no del código).
- **Clasificación Short/video largo de YouTube es por duración** (≤60s), no por orientación real del archivo — ver comentario en `src/lib/youtube/api.ts` (la alternativa con permisos reales de YouTube requiere acceso de socio/partner, que una cuenta normal no tiene).

---

## 8. Checklist rápido para levantar esto en una cuenta nueva

1. `npm install` y completar `.env.local` (sección 3).
2. Crear el proyecto en Supabase, correr `/admin` → "Aplicar migración".
3. Dar de alta las apps en Meta/Google Cloud/TikTok con las redirect URI del dominio final, y cargar esas credenciales.
4. Generar el token de Kommo (integración privada) si se va a usar ese módulo.
5. Configurar el storage de video (hoy Vercel Blob — ver sección 6 si el hosting es otro).
6. Cargar las mismas variables de entorno como *Secrets* de GitHub Actions para que los cron jobs funcionen.
7. Conectar cada cuenta desde `/admin` (Instagram, YouTube, TikTok, Meta Ads).
