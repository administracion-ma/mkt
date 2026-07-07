import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getOwnChannel } from "@/lib/youtube/oauth";
import { saveConnectedChannel } from "@/lib/youtube/account-store";

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
  const expectedState = cookieStore.get("yt_oauth_state")?.value;
  cookieStore.delete("yt_oauth_state");
  if (!expectedState || expectedState !== state) {
    return NextResponse.json({ error: "state inválido (posible CSRF)" }, { status: 400 });
  }

  try {
    const { accessToken, refreshToken, expiresInSeconds } = await exchangeCodeForTokens(code);
    const channel = await getOwnChannel(accessToken);

    await saveConnectedChannel({
      channelId: channel.id,
      channelTitle: channel.title,
      accessToken,
      refreshToken,
      expiresInSeconds,
    });

    return NextResponse.redirect(new URL("/youtube?connected=1", request.url));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
