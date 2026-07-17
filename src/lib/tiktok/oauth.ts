import { createHash, randomBytes } from "crypto";
import { env } from "@/lib/env";

// OAuth2 de TikTok for Developers — a diferencia de Meta/Google, el flujo web
// exige PKCE (obligatorio desde 2023): sin code_verifier/code_challenge,
// TikTok rechaza la autorización.
// https://developers.tiktok.com/doc/oauth-user-access-token-management
const AUTH_BASE = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";

// video.publish requiere que la app esté auditada por TikTok para publicar
// como PUBLIC_TO_EVERYONE — hasta entonces, cualquier post sale SELF_ONLY.
const SCOPES = ["user.info.basic", "video.list", "video.publish"].join(",");

export function generateCodeVerifier(): string {
  return randomBytes(64).toString("base64url");
}

export function codeChallengeFromVerifier(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthorizeUrl(state: string, codeChallenge: string): string {
  const url = new URL(AUTH_BASE);
  url.searchParams.set("client_key", env.tiktokClientKey);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("redirect_uri", env.tiktokRedirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  open_id: string;
  error?: string;
  error_description?: string;
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<{ accessToken: string; refreshToken: string; expiresInSeconds: number; openId: string }> {
  const form = new URLSearchParams();
  form.set("client_key", env.tiktokClientKey);
  form.set("client_secret", env.tiktokClientSecret);
  form.set("code", code);
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", env.tiktokRedirectUri);
  form.set("code_verifier", codeVerifier);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(10000),
  });
  const body: TokenResponse = await res.json();
  if (!res.ok || body.error) {
    throw new Error(`Error al intercambiar el code de TikTok: ${JSON.stringify(body)}`);
  }
  return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresInSeconds: body.expires_in, openId: body.open_id };
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresInSeconds: number }> {
  const form = new URLSearchParams();
  form.set("client_key", env.tiktokClientKey);
  form.set("client_secret", env.tiktokClientSecret);
  form.set("grant_type", "refresh_token");
  form.set("refresh_token", refreshToken);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(10000),
  });
  const body: TokenResponse = await res.json();
  if (!res.ok || body.error) {
    throw new Error(`Error al refrescar el token de TikTok: ${JSON.stringify(body)}`);
  }
  // TikTok rota el refresh_token en cada uso — hay que guardar el nuevo,
  // el viejo deja de servir.
  return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresInSeconds: body.expires_in };
}

export async function getOwnProfile(accessToken: string): Promise<{ openId: string; displayName: string }> {
  const url = new URL(USER_INFO_URL);
  url.searchParams.set("fields", "open_id,display_name");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json();
  if (!res.ok || body.error?.code !== "ok") {
    throw new Error(`Error al obtener el perfil de TikTok: ${JSON.stringify(body)}`);
  }
  return { openId: body.data.user.open_id, displayName: body.data.user.display_name };
}
