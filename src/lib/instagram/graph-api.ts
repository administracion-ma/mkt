const GRAPH_BASE = "https://graph.instagram.com";

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString());
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Graph API error en ${path}: ${JSON.stringify(body)}`);
  }
  return body as T;
}

export interface IgAccountSummary {
  id: string;
  username: string;
  followersCount: number;
  mediaCount: number;
}

export async function getAccountSummary(
  igUserId: string,
  accessToken: string
): Promise<IgAccountSummary> {
  const data = await graphGet<{
    id: string;
    username: string;
    followers_count: number;
    media_count: number;
  }>(`/${igUserId}`, {
    fields: "id,username,followers_count,media_count",
    access_token: accessToken,
  });
  return {
    id: data.id,
    username: data.username,
    followersCount: data.followers_count,
    mediaCount: data.media_count,
  };
}

export interface IgRecentMedia {
  id: string;
  caption?: string;
  mediaType: string;
  permalink: string;
  timestamp: string;
  mediaUrl?: string;
}

export async function getRecentMedia(
  igUserId: string,
  accessToken: string,
  limit = 10
): Promise<IgRecentMedia[]> {
  const data = await graphGet<{
    data: Array<{
      id: string;
      caption?: string;
      media_type: string;
      permalink: string;
      timestamp: string;
    }>;
  }>(`/${igUserId}/media`, {
    fields: "id,caption,media_type,permalink,timestamp",
    limit: String(limit),
    access_token: accessToken,
  });
  return data.data.map((item) => ({
    id: item.id,
    caption: item.caption,
    mediaType: item.media_type,
    permalink: item.permalink,
    timestamp: item.timestamp,
  }));
}

export async function getAllInstagramMedia(
  igUserId: string,
  accessToken: string
): Promise<IgRecentMedia[]> {
  const allMedia: IgRecentMedia[] = [];
  let after: string | undefined;

  while (true) {
    const params: Record<string, string> = {
      fields: "id,caption,media_type,permalink,timestamp,media_url,thumbnail_url",
      limit: "50",
      access_token: accessToken,
    };
    if (after) params.after = after;

    const data = await graphGet<{
      data: Array<{
        id: string;
        caption?: string;
        media_type: string;
        permalink: string;
        timestamp: string;
        media_url?: string;
        thumbnail_url?: string;
      }>;
      paging?: { cursors?: { after?: string }; next?: string };
    }>(`/${igUserId}/media`, params);

    for (const item of data.data) {
      allMedia.push({
        id: item.id,
        caption: item.caption,
        mediaType: item.media_type,
        permalink: item.permalink,
        timestamp: item.timestamp,
        mediaUrl: item.media_url ?? item.thumbnail_url ?? item.permalink,
      });
    }

    if (!data.paging?.next || !data.paging.cursors?.after) break;
    after = data.paging.cursors.after;
  }

  return allMedia;
}

async function graphPost<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Graph API error en ${path}: ${JSON.stringify(body)}`);
  }
  return body as T;
}

export interface CreateContainerInput {
  igUserId: string;
  accessToken: string;
  mediaUrl: string;
  caption: string;
  mediaType: "IMAGE" | "VIDEO" | "REELS";
}

export async function createMediaContainer(input: CreateContainerInput): Promise<string> {
  const isVideo = input.mediaType === "VIDEO" || input.mediaType === "REELS";
  const params: Record<string, string> = {
    caption: input.caption,
    access_token: input.accessToken,
  };
  if (isVideo) {
    // El Graph API solo conoce media_type=REELS para video; un VIDEO normal
    // se publica igual como reel (al consultarlo después, media_type vuelve "VIDEO").
    params.media_type = "REELS";
    params.video_url = input.mediaUrl;
  } else {
    params.image_url = input.mediaUrl;
  }

  const body = await graphPost<{ id: string }>(`/${input.igUserId}/media`, params);
  return body.id;
}

export type ContainerStatusCode = "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED";

export async function getContainerStatus(
  containerId: string,
  accessToken: string
): Promise<{ statusCode: ContainerStatusCode; statusText?: string }> {
  const data = await graphGet<{ status_code: ContainerStatusCode; status?: string }>(
    `/${containerId}`,
    { fields: "status_code,status", access_token: accessToken }
  );
  return { statusCode: data.status_code, statusText: data.status };
}

export async function waitForContainerReady(
  containerId: string,
  accessToken: string,
  options: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<void> {
  const intervalMs = options.intervalMs ?? 5000;
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const { statusCode, statusText } = await getContainerStatus(containerId, accessToken);
    if (statusCode === "FINISHED") {
      return;
    }
    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      throw new Error(`El contenedor de media no se pudo procesar (${statusCode}): ${statusText ?? ""}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Tiempo de espera agotado procesando el contenedor de media");
}

export async function publishMediaContainer(
  igUserId: string,
  containerId: string,
  accessToken: string
): Promise<string> {
  const body = await graphPost<{ id: string }>(`/${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken,
  });
  return body.id;
}

export async function getPublishedMediaPermalink(
  mediaId: string,
  accessToken: string
): Promise<string | undefined> {
  const data = await graphGet<{ permalink?: string }>(`/${mediaId}`, {
    fields: "permalink",
    access_token: accessToken,
  });
  return data.permalink;
}

export interface MediaInsights {
  impressions?: number;
  reach?: number;
  likeCount?: number;
  commentCount?: number;
  savedCount?: number;
  sharesCount?: number;
  plays?: number;
  totalInteractions?: number;
}

export async function getMediaInsights(
  mediaId: string,
  accessToken: string,
  isVideo: boolean
): Promise<MediaInsights> {
  const result: MediaInsights = {};

  // like_count and comments_count come from the media object directly
  try {
    const media = await graphGet<{ like_count?: number; comments_count?: number }>(
      `/${mediaId}`,
      { fields: "like_count,comments_count", access_token: accessToken }
    );
    if (media.like_count !== undefined) result.likeCount = media.like_count;
    if (media.comments_count !== undefined) result.commentCount = media.comments_count;
  } catch {
    // insights permission might not cover this field
  }

  // impressions is only valid for IMAGE/CAROUSEL; VIDEO/REELS uses plays instead
  const metricsList = isVideo
    ? ["reach", "plays", "saved", "shares", "total_interactions"]
    : ["impressions", "reach", "saved", "shares", "total_interactions"];

  try {
    const data = await graphGet<{
      data: Array<{ name: string; values?: Array<{ value: number }>; value?: number }>;
    }>(`/${mediaId}/insights`, {
      metric: metricsList.join(","),
      period: "lifetime",
      access_token: accessToken,
    });

    for (const item of data.data) {
      const value =
        typeof item.value === "number" ? item.value : item.values?.[0]?.value;
      if (value === undefined) continue;
      switch (item.name) {
        case "impressions":        result.impressions = value; break;
        case "reach":              result.reach = value; break;
        case "saved":              result.savedCount = value; break;
        case "shares":             result.sharesCount = value; break;
        case "plays":              result.plays = value; break;
        case "total_interactions": result.totalInteractions = value; break;
      }
    }
  } catch (err) {
    console.error(`[insights] ${mediaId}:`, err instanceof Error ? err.message : err);
  }

  return result;
}
