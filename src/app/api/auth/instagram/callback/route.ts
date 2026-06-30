import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  getConnectedInstagramAccount,
} from "@/lib/instagram/oauth";
import { saveConnectedAccount } from "@/lib/instagram/account-store";

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
  const expectedState = cookieStore.get("ig_oauth_state")?.value;
  cookieStore.delete("ig_oauth_state");
  if (!expectedState || expectedState !== state) {
    return NextResponse.json({ error: "state inválido (posible CSRF)" }, { status: 400 });
  }

  try {
    const { accessToken: shortLivedToken } = await exchangeCodeForShortLivedToken(code);
    const { accessToken, expiresInSeconds } = await exchangeForLongLivedToken(shortLivedToken);
    const igAccount = await getConnectedInstagramAccount(accessToken);

    await saveConnectedAccount({
      igUserId: igAccount.id,
      igUsername: igAccount.username,
      accessToken,
      expiresInSeconds,
    });

    return NextResponse.redirect(new URL("/?connected=1", request.url));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
