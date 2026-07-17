import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getOwnProfile } from "@/lib/tiktok/oauth";
import { saveConnectedTiktokAccount } from "@/lib/tiktok/account-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error_description") || searchParams.get("error");

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }
  if (!code || !state) {
    return NextResponse.json({ error: "Falta code o state" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("tt_oauth_state")?.value;
  const codeVerifier = cookieStore.get("tt_code_verifier")?.value;
  cookieStore.delete("tt_oauth_state");
  cookieStore.delete("tt_code_verifier");

  if (!expectedState || expectedState !== state) {
    return NextResponse.json({ error: "state inválido (posible CSRF)" }, { status: 400 });
  }
  if (!codeVerifier) {
    return NextResponse.json({ error: "Falta el code_verifier — la sesión de login expiró, probá conectar de nuevo." }, { status: 400 });
  }

  try {
    const { accessToken, refreshToken, expiresInSeconds, openId } = await exchangeCodeForTokens(code, codeVerifier);
    const profile = await getOwnProfile(accessToken);

    await saveConnectedTiktokAccount({
      openId: openId || profile.openId,
      displayName: profile.displayName,
      accessToken,
      refreshToken,
      expiresInSeconds,
    });

    return NextResponse.redirect(new URL("/tiktok?connected=1", request.url));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
