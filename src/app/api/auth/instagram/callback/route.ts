import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  getConnectedInstagramAccount,
  listPages,
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
    const shortLivedToken = await exchangeCodeForShortLivedToken(code);
    const { accessToken: userAccessToken, expiresInSeconds } =
      await exchangeForLongLivedToken(shortLivedToken);

    const pages = await listPages(userAccessToken);
    if (pages.length === 0) {
      return NextResponse.json(
        { error: "Tu usuario de Facebook no administra ninguna Página." },
        { status: 400 }
      );
    }

    for (const page of pages) {
      const igAccount = await getConnectedInstagramAccount(page.id, page.access_token);
      if (igAccount) {
        await saveConnectedAccount({
          igUserId: igAccount.id,
          igUsername: igAccount.username,
          fbPageId: page.id,
          pageAccessToken: page.access_token,
          userAccessToken,
          expiresInSeconds,
        });
        return NextResponse.redirect(new URL("/?connected=1", request.url));
      }
    }

    return NextResponse.json(
      {
        error:
          "Ninguna de tus Páginas de Facebook tiene una cuenta de Instagram Business vinculada.",
      },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
