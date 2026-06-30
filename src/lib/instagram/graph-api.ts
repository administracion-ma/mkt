import { env } from "@/lib/env";

const GRAPH_BASE = "https://graph.facebook.com";

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}/${env.metaGraphApiVersion}${path}`);
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
