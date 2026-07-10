import { env } from "@/lib/env";

// OAuth2 estándar de Google (no Meta) — ver
// https://developers.google.com/identity/protocols/oauth2/web-server
const AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
].join(" ");

export function buildAuthorizeUrl(state: string): string {
  const url = new URL(AUTH_BASE);
  url.searchParams.set("client_id", env.youtubeClientId);
  url.searchParams.set("redirect_uri", env.youtubeRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  // access_type=offline + prompt=consent: sin esto Google no siempre manda
  // refresh_token (solo lo manda la primera vez que se autoriza la app).
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export async function exchangeCodeForTokens(
  code: string
): Promise<{ accessToken: string; refreshToken: string; expiresInSeconds: number }> {
  const form = new URLSearchParams();
  form.set("client_id", env.youtubeClientId);
  form.set("client_secret", env.youtubeClientSecret);
  form.set("redirect_uri", env.youtubeRedirectUri);
  form.set("code", code);
  form.set("grant_type", "authorization_code");

  const res = await fetch(TOKEN_URL, { method: "POST", body: form, signal: AbortSignal.timeout(10000) });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Error al intercambiar el code: ${JSON.stringify(body)}`);
  }
  if (!body.refresh_token) {
    throw new Error(
      "Google no devolvió refresh_token — revocá el acceso de la app en https://myaccount.google.com/permissions y volvé a conectar."
    );
  }
  return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresInSeconds: body.expires_in };
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const form = new URLSearchParams();
  form.set("client_id", env.youtubeClientId);
  form.set("client_secret", env.youtubeClientSecret);
  form.set("refresh_token", refreshToken);
  form.set("grant_type", "refresh_token");

  const res = await fetch(TOKEN_URL, { method: "POST", body: form, signal: AbortSignal.timeout(10000) });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Error al refrescar el token: ${JSON.stringify(body)}`);
  }
  return { accessToken: body.access_token, expiresInSeconds: body.expires_in };
}

export async function getOwnChannel(accessToken: string): Promise<{ id: string; title: string }> {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("mine", "true");

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Error al obtener el canal de YouTube: ${JSON.stringify(body)}`);
  }
  const channel = body.items?.[0];
  if (!channel) {
    throw new Error("La cuenta de Google no tiene un canal de YouTube asociado.");
  }
  return { id: channel.id, title: channel.snippet.title };
}
