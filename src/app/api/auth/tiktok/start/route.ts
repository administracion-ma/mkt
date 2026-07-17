import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl, generateCodeVerifier, codeChallengeFromVerifier } from "@/lib/tiktok/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = codeChallengeFromVerifier(codeVerifier);

  const cookieStore = await cookies();
  cookieStore.set("tt_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  // El code_verifier tiene que viajar del start al callback sin pasar por
  // TikTok (es la prueba de que ambos pasos los hizo el mismo navegador) —
  // por eso cookie propia, aparte del state.
  cookieStore.set("tt_code_verifier", codeVerifier, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(buildAuthorizeUrl(state, codeChallenge));
}
