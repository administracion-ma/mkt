import { env } from "@/lib/env";

const IG_OAUTH_BASE = "https://api.instagram.com";
const IG_GRAPH_BASE = "https://graph.instagram.com";

const SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_comments",
  "instagram_business_manage_insights",
].join(",");

export function buildAuthorizeUrl(state: string): string {
  const url = new URL(`${IG_OAUTH_BASE}/oauth/authorize`);
  url.searchParams.set("client_id", env.instagramAppId);
  url.searchParams.set("redirect_uri", env.metaRedirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("response_type", "code");
  return url.toString();
}

export async function exchangeCodeForShortLivedToken(
  code: string
): Promise<{ accessToken: string; igUserId: string }> {
  const form = new URLSearchParams();
  form.set("client_id", env.instagramAppId);
  form.set("client_secret", env.instagramAppSecret);
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", env.metaRedirectUri);
  form.set("code", code);

  const res = await fetch(`${IG_OAUTH_BASE}/oauth/access_token`, {
    method: "POST",
    body: form,
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Error al intercambiar el code: ${JSON.stringify(body)}`);
  }
  return { accessToken: body.access_token, igUserId: String(body.user_id) };
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const url = new URL(`${IG_GRAPH_BASE}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", env.instagramAppSecret);
  url.searchParams.set("access_token", shortLivedToken);

  const res = await fetch(url.toString());
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Error al obtener token de larga duración: ${JSON.stringify(body)}`);
  }
  return { accessToken: body.access_token, expiresInSeconds: body.expires_in };
}

export async function refreshLongLivedToken(
  currentLongLivedToken: string
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const url = new URL(`${IG_GRAPH_BASE}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", currentLongLivedToken);

  const res = await fetch(url.toString());
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Error al refrescar el token: ${JSON.stringify(body)}`);
  }
  return { accessToken: body.access_token, expiresInSeconds: body.expires_in };
}

export async function getConnectedInstagramAccount(
  accessToken: string
): Promise<{ id: string; username: string }> {
  const url = new URL(`${IG_GRAPH_BASE}/me`);
  url.searchParams.set("fields", "id,username");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Error al obtener la cuenta de Instagram: ${JSON.stringify(body)}`);
  }
  return body;
}
