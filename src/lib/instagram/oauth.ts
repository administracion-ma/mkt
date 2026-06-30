import { env } from "@/lib/env";

const GRAPH_BASE = "https://graph.facebook.com";
const FB_OAUTH_DIALOG = "https://www.facebook.com";

const SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "instagram_manage_comments",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
].join(",");

export function buildAuthorizeUrl(state: string): string {
  const url = new URL(`${FB_OAUTH_DIALOG}/${env.metaGraphApiVersion}/dialog/oauth`);
  url.searchParams.set("client_id", env.metaAppId);
  url.searchParams.set("redirect_uri", env.metaRedirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("response_type", "code");
  return url.toString();
}

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

export async function exchangeCodeForShortLivedToken(code: string): Promise<string> {
  const data = await graphGet<{ access_token: string }>("/oauth/access_token", {
    client_id: env.metaAppId,
    client_secret: env.metaAppSecret,
    redirect_uri: env.metaRedirectUri,
    code,
  });
  return data.access_token;
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const data = await graphGet<{ access_token: string; expires_in: number }>(
    "/oauth/access_token",
    {
      grant_type: "fb_exchange_token",
      client_id: env.metaAppId,
      client_secret: env.metaAppSecret,
      fb_exchange_token: shortLivedToken,
    }
  );
  return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
}

export async function refreshLongLivedToken(
  currentLongLivedToken: string
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  return exchangeForLongLivedToken(currentLongLivedToken);
}

interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
}

export async function listPages(userAccessToken: string): Promise<FacebookPage[]> {
  const data = await graphGet<{ data: FacebookPage[] }>("/me/accounts", {
    access_token: userAccessToken,
  });
  return data.data;
}

export async function getConnectedInstagramAccount(
  pageId: string,
  pageAccessToken: string
): Promise<{ id: string; username: string } | null> {
  const data = await graphGet<{
    instagram_business_account?: { id: string };
  }>(`/${pageId}`, {
    fields: "instagram_business_account",
    access_token: pageAccessToken,
  });
  if (!data.instagram_business_account) {
    return null;
  }
  const igAccount = await graphGet<{ id: string; username: string }>(
    `/${data.instagram_business_account.id}`,
    { fields: "id,username", access_token: pageAccessToken }
  );
  return igAccount;
}
