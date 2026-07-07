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
