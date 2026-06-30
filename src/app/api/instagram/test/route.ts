import { NextResponse } from "next/server";
import { getConnectedAccount } from "@/lib/instagram/account-store";
import { getAccountSummary, getRecentMedia } from "@/lib/instagram/graph-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const account = await getConnectedAccount();
  if (!account) {
    return NextResponse.json(
      { error: "No hay ninguna cuenta de Instagram conectada todavía. Andá a /api/auth/instagram/start" },
      { status: 400 }
    );
  }

  try {
    const [summary, recentMedia] = await Promise.all([
      getAccountSummary(account.igUserId, account.accessToken),
      getRecentMedia(account.igUserId, account.accessToken, 10),
    ]);

    return NextResponse.json({
      account: summary,
      recentMedia,
      tokenExpiresAt: account.tokenExpiresAt,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
