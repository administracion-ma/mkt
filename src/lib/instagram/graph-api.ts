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
  videoDurationMs?: number;
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
      fields: "id,caption,media_type,permalink,timestamp,media_url,thumbnail_url,duration",
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
        duration?: number;
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
        videoDurationMs: item.duration != null ? Math.round(item.duration * 1000) : undefined,
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

export async function graphGetMediaDuration(
  mediaId: string,
  accessToken: string
): Promise<number | null> {
  const data = await graphGet<{ duration?: number }>(`/${mediaId}`, {
    fields: "duration",
    access_token: accessToken,
  });
  return data.duration != null ? Math.round(data.duration * 1000) : null;
}

export interface MediaInsights {
  impressions?: number;
  reach?: number;
  likeCount?: number;
  commentCount?: number;
  savedCount?: number;
  sharesCount?: number;
  repostsCount?: number;
  plays?: number;
  totalInteractions?: number;
  avgWatchTimeMs?: number;
  skipRate?: number;
  followsCount?: number;
  profileVisits?: number;
  followersReach?: number;
  nonFollowersReach?: number;
}

export type MediaType = "IMAGE" | "VIDEO" | "REELS" | "CAROUSEL_ALBUM";

export async function getMediaInsights(
  mediaId: string,
  accessToken: string,
  mediaType: MediaType
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

  const metricsList =
    mediaType === "REELS"
      ? ["reach", "saved", "shares", "reposts", "total_interactions", "views",
         "ig_reels_avg_watch_time", "reels_skip_rate"]
      : mediaType === "VIDEO"
      ? ["reach", "saved", "shares", "total_interactions", "views"]
      : ["reach", "saved", "shares", "total_interactions"]; // IMAGE, CAROUSEL_ALBUM

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
        case "reach":                    result.reach = value; break;
        case "saved":                    result.savedCount = value; break;
        case "shares":                   result.sharesCount = value; break;
        case "reposts":                  result.repostsCount = value; break;
        case "views":                    result.plays = value; break;
        case "total_interactions":       result.totalInteractions = value; break;
        case "ig_reels_avg_watch_time":  result.avgWatchTimeMs = value; break;
        case "reels_skip_rate":          result.skipRate = value; break;
      }
    }
  } catch (err) {
    console.error(`[insights] ${mediaId}:`, err instanceof Error ? err.message : err);
  }

  if (mediaType === "REELS" || mediaType === "VIDEO") {
    // Try Reels-specific retention metrics for VIDEO too — Meta labels many Reels as VIDEO
    if (mediaType === "VIDEO") {
      try {
        const reelsExtra = await graphGet<{
          data: Array<{ name: string; values?: Array<{ value: number }>; value?: number }>;
        }>(`/${mediaId}/insights`, {
          metric: "ig_reels_avg_watch_time,reels_skip_rate",
          period: "lifetime",
          access_token: accessToken,
        });
        for (const item of reelsExtra.data) {
          const value =
            typeof item.value === "number" ? item.value : item.values?.[0]?.value;
          if (value === undefined) continue;
          if (item.name === "ig_reels_avg_watch_time") result.avgWatchTimeMs = value;
          if (item.name === "reels_skip_rate")          result.skipRate = value;
        }
      } catch {
        // not a reel, skip
      }
    }

    try {
      const extra = await graphGet<{
        data: Array<{ name: string; values?: Array<{ value: number }>; value?: number }>;
      }>(`/${mediaId}/insights`, {
        metric: "follows,profile_visits",
        period: "lifetime",
        access_token: accessToken,
      });
      for (const item of extra.data) {
        const value =
          typeof item.value === "number" ? item.value : item.values?.[0]?.value;
        if (value === undefined) continue;
        if (item.name === "follows")        result.followsCount = value;
        if (item.name === "profile_visits") result.profileVisits = value;
      }
    } catch (err) {
      console.error(`[follows/visits] ${mediaId}:`, err instanceof Error ? err.message : err);
    }

    // Follower vs non-follower reach breakdown
    try {
      const breakdown = await graphGet<{
        data: Array<{
          name: string;
          breakdown?: {
            dimension_keys: string[];
            results: Array<{ dimension_values: string[]; value: number }>;
          };
        }>;
      }>(`/${mediaId}/insights`, {
        metric: "reach",
        breakdown: "follower_type",
        period: "lifetime",
        access_token: accessToken,
      });
      for (const item of breakdown.data) {
        if (item.name === "reach" && item.breakdown) {
          for (const r of item.breakdown.results) {
            const ftype = r.dimension_values[0];
            if (ftype === "FOLLOWER")     result.followersReach    = r.value;
            if (ftype === "NON_FOLLOWER") result.nonFollowersReach = r.value;
          }
        }
      }
    } catch {
      // breakdown not supported for this media type
    }
  }

  return result;
}
