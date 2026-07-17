// Wrapper de TikTok Display API (perfil, listado de videos) y Content
// Posting API (publicar, consultar estado). TikTok envuelve hasta las
// respuestas OK en un objeto "error" con code:"ok" — ojo con ese detalle
// al chequear éxito, no alcanza con response.ok.
const API_BASE = "https://open.tiktokapis.com/v2";

function checkOk(res: Response, body: { error?: { code?: string; message?: string } }, label: string) {
  if (!res.ok || (body.error && body.error.code !== "ok")) {
    throw new Error(`Error de TikTok en ${label}: ${JSON.stringify(body)}`);
  }
}

export async function getAccountStats(
  accessToken: string
): Promise<{ followerCount: number | null; likesCount: number | null; videoCount: number | null }> {
  const url = new URL(`${API_BASE}/user/info/`);
  url.searchParams.set("fields", "follower_count,likes_count,video_count");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json();
  checkOk(res, body, "user/info");

  const user = body.data?.user ?? {};
  return {
    followerCount: user.follower_count ?? null,
    likesCount: user.likes_count ?? null,
    videoCount: user.video_count ?? null,
  };
}

export type TiktokVideoInfo = {
  videoId: string;
  title: string;
  shareUrl: string;
  coverImageUrl: string | null;
  createTime: number; // epoch seconds
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
};

// Query Videos (Display API) — trae los videos ya publicados en el perfil,
// con sus contadores públicos. Paginado con cursor opaco (lo que devuelve
// TikTok, no armarlo a mano).
export async function listVideos(accessToken: string, cursor?: string): Promise<{ videos: TiktokVideoInfo[]; nextCursor: string | null; hasMore: boolean }> {
  const url = new URL(`${API_BASE}/video/list/`);
  url.searchParams.set("fields", "id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }),
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json();
  checkOk(res, body, "video/list");

  const videos: TiktokVideoInfo[] = (body.data?.videos ?? []).map((v: Record<string, unknown>) => ({
    videoId: String(v.id),
    title: (v.title as string) || (v.video_description as string) || "(sin título)",
    shareUrl: v.share_url as string,
    coverImageUrl: (v.cover_image_url as string) ?? null,
    createTime: Number(v.create_time),
    views: v.view_count != null ? Number(v.view_count) : null,
    likes: v.like_count != null ? Number(v.like_count) : null,
    comments: v.comment_count != null ? Number(v.comment_count) : null,
    shares: v.share_count != null ? Number(v.share_count) : null,
  }));

  return { videos, nextCursor: body.data?.cursor ? String(body.data.cursor) : null, hasMore: !!body.data?.has_more };
}

// Publicación directa vía URL (PULL_FROM_URL): TikTok descarga el video desde
// nuestro Blob público, sin que nosotros subamos bytes. Requiere que el
// dominio de esa URL esté verificado en el portal de TikTok for Developers
// ("URL Prefix" en Content Posting API) — sin eso, esta llamada falla.
export async function initVideoPublish(
  accessToken: string,
  input: { title: string; privacyLevel: string; videoUrl: string }
): Promise<{ publishId: string }> {
  const res = await fetch(`${API_BASE}/post/publish/video/init/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      post_info: {
        title: input.title,
        privacy_level: input.privacyLevel,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: { source: "PULL_FROM_URL", video_url: input.videoUrl },
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json();
  checkOk(res, body, "post/publish/video/init");

  if (!body.data?.publish_id) {
    throw new Error(`TikTok no devolvió publish_id: ${JSON.stringify(body)}`);
  }
  return { publishId: body.data.publish_id };
}

export type PublishStatus = "PROCESSING_DOWNLOAD" | "PROCESSING_UPLOAD" | "SEND_TO_USER_INBOX" | "PUBLISH_COMPLETE" | "FAILED";

export async function fetchPublishStatus(
  accessToken: string,
  publishId: string
): Promise<{ status: PublishStatus; videoId: string | null; failReason: string | null }> {
  const res = await fetch(`${API_BASE}/post/publish/status/fetch/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ publish_id: publishId }),
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json();
  checkOk(res, body, "post/publish/status/fetch");

  // Sic: el campo viene con este typo en la API real de TikTok.
  const ids: string[] | undefined = body.data?.publicaly_available_post_id;
  return {
    status: body.data?.status,
    videoId: ids && ids.length > 0 ? ids[0] : null,
    failReason: body.data?.fail_reason ?? null,
  };
}
