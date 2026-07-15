// Wrapper de YouTube Data API v3 (canal, subida resumable) y YouTube
// Analytics API v2 (métricas por video — la Data API solo da lo público:
// views/likes/comments, no retención ni suscriptores ganados).

const DATA_API = "https://www.googleapis.com/youtube/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3/videos";
const ANALYTICS_API = "https://youtubeanalytics.googleapis.com/v2/reports";

// "Science & Technology" — la más cercana a hardware de minería entre las
// categorías fijas que exige la API.
const CATEGORY_ID = "28";

interface UploadMeta {
  title: string;
  description: string;
  privacyStatus: "public" | "unlisted" | "private";
}

// Paso 1 del protocolo resumable: pide una URL de sesión de subida.
// https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
export async function startResumableUpload(
  accessToken: string,
  meta: UploadMeta,
  sizeBytes: number,
  mimeType: string
): Promise<string> {
  const res = await fetch(`${UPLOAD_API}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": String(sizeBytes),
    },
    body: JSON.stringify({
      snippet: { title: meta.title, description: meta.description, categoryId: CATEGORY_ID },
      status: { privacyStatus: meta.privacyStatus, selfDeclaredMadeForKids: false },
    }),
  });
  if (!res.ok) {
    throw new Error(`Error al iniciar la subida a YouTube: ${await res.text()}`);
  }
  const location = res.headers.get("Location");
  if (!location) {
    throw new Error("YouTube no devolvió la URL de subida (header Location).");
  }
  return location;
}

// Paso 2: sube los bytes del video a la URL de sesión. Se manda en un solo
// PUT (no fragmentado) — funciona bien para videos cortos/medianos; para
// archivos muy grandes convendría fragmentar, pero esto corre desde el cron
// de GitHub Actions (mucho más margen de tiempo que una función de Vercel).
export async function uploadVideoBytes(uploadUrl: string, videoBytes: Buffer, mimeType: string): Promise<{ videoId: string }> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType, "Content-Length": String(videoBytes.byteLength) },
    body: videoBytes as unknown as BodyInit,
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Error al subir el video a YouTube: ${JSON.stringify(body)}`);
  }
  return { videoId: body.id };
}

export function getYoutubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export type YoutubeVideoInsights = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  averageViewDurationSec: number | null;
  averageViewPercentage: number | null;
  subscribersGained: number | null;
};

// Métricas acumuladas de un video desde que se publicó hasta `endDate`
// (YYYY-MM-DD). La Analytics API no da un snapshot puntual, da un rango.
export async function getVideoAnalytics(
  accessToken: string,
  channelId: string,
  videoId: string,
  startDate: string,
  endDate: string
): Promise<YoutubeVideoInsights> {
  const empty: YoutubeVideoInsights = {
    views: null, likes: null, comments: null, shares: null,
    averageViewDurationSec: null, averageViewPercentage: null, subscribersGained: null,
  };

  const url = new URL(ANALYTICS_API);
  url.searchParams.set("ids", `channel==${channelId}`);
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", endDate);
  url.searchParams.set("metrics", "views,likes,comments,shares,averageViewDuration,averageViewPercentage,subscribersGained");
  url.searchParams.set("filters", `video==${videoId}`);

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Error al obtener analíticas del video: ${JSON.stringify(body)}`);
  }

  const row: (number | null)[] | undefined = body.rows?.[0];
  if (!row) return empty;

  const [views, likes, comments, shares, averageViewDurationSec, averageViewPercentage, subscribersGained] = row;
  return { views, likes, comments, shares, averageViewDurationSec, averageViewPercentage, subscribersGained };
}

export type UploadedVideo = {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string; // ISO
};

// Lista todos los videos ya subidos al canal (para importar el historial,
// mismo espíritu que import-instagram-history). Usa la playlist "uploads"
// del canal, que YouTube mantiene automáticamente con todos los videos.
export async function listUploadedVideos(accessToken: string, channelId: string): Promise<UploadedVideo[]> {
  const chUrl = new URL(`${DATA_API}/channels`);
  chUrl.searchParams.set("part", "contentDetails");
  chUrl.searchParams.set("id", channelId);

  const chRes = await fetch(chUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) });
  const chBody = await chRes.json();
  if (!chRes.ok) {
    throw new Error(`Error al obtener la playlist de subidas: ${JSON.stringify(chBody)}`);
  }
  const uploadsPlaylistId = chBody.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) return [];

  const out: UploadedVideo[] = [];
  let pageToken: string | undefined;
  do {
    const plUrl = new URL(`${DATA_API}/playlistItems`);
    plUrl.searchParams.set("part", "snippet");
    plUrl.searchParams.set("playlistId", uploadsPlaylistId);
    plUrl.searchParams.set("maxResults", "50");
    if (pageToken) plUrl.searchParams.set("pageToken", pageToken);

    const res = await fetch(plUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(`Error al listar videos del canal: ${JSON.stringify(body)}`);
    }
    for (const item of body.items ?? []) {
      const sn = item.snippet;
      const videoId = sn?.resourceId?.videoId;
      if (!videoId) continue;
      out.push({
        videoId,
        title: sn.title ?? "(sin título)",
        description: sn.description ?? "",
        publishedAt: sn.publishedAt,
      });
    }
    pageToken = body.nextPageToken;
  } while (pageToken);

  return out;
}

export type VideoPublicInfo = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  durationSec: number | null;
  isVertical: boolean | null; // del archivo real (fileDetails) — vertical = Short
};

function parseIsoDuration(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}

// Contadores públicos (Data API) — a diferencia de la Analytics API (que
// tiene 24-48h de retraso y deja los videos recientes sin métricas), estos
// son casi en tiempo real. Se usan como respaldo de vistas/likes/comentarios.
export async function getVideosPublicInfo(accessToken: string, videoIds: string[]): Promise<Map<string, VideoPublicInfo>> {
  const out = new Map<string, VideoPublicInfo>();
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const url = new URL(`${DATA_API}/videos`);
    // fileDetails (solo visible para el dueño del canal, que somos nosotros)
    // trae el ancho/alto real del archivo — la forma confiable de saber si un
    // video es vertical (Short) u horizontal, sin trucos de scraping.
    url.searchParams.set("part", "statistics,contentDetails,fileDetails");
    url.searchParams.set("id", batch.join(","));

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(`Error al obtener stats públicas de videos: ${JSON.stringify(body)}`);
    }
    for (const item of body.items ?? []) {
      const st = item.statistics;
      const stream = item.fileDetails?.videoStreams?.[0];
      // aspectRatio es la relación de aspecto EN PANTALLA (ya contempla la
      // metadata de rotación del archivo) — <1 = vertical. Adivinar con
      // ancho/alto + rotation clasificaba mal videos horizontales editados
      // que traen rotation espuria. Solo si falta, caemos a alto>ancho crudo.
      const ar = stream?.aspectRatio != null ? Number(stream.aspectRatio) : null;
      const w = stream?.widthPixels != null ? Number(stream.widthPixels) : null;
      const h = stream?.heightPixels != null ? Number(stream.heightPixels) : null;
      const isVertical = ar != null && ar > 0 ? ar < 1 : w != null && h != null ? h > w : null;
      out.set(item.id, {
        views: st?.viewCount != null ? Number(st.viewCount) : null,
        likes: st?.likeCount != null ? Number(st.likeCount) : null,
        comments: st?.commentCount != null ? Number(st.commentCount) : null,
        durationSec: parseIsoDuration(item.contentDetails?.duration),
        isVertical,
      });
    }
  }
  return out;
}

export async function getChannelSummary(
  accessToken: string,
  channelId: string
): Promise<{ subscriberCount: number | null; viewCount: number | null }> {
  const url = new URL(`${DATA_API}/channels`);
  url.searchParams.set("part", "statistics");
  url.searchParams.set("id", channelId);

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Error al obtener estadísticas del canal: ${JSON.stringify(body)}`);
  }
  const stats = body.items?.[0]?.statistics;
  return {
    subscriberCount: stats?.subscriberCount != null ? Number(stats.subscriberCount) : null,
    viewCount: stats?.viewCount != null ? Number(stats.viewCount) : null,
  };
}
