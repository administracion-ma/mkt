import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { ads } from "@/db/schema";
import { getConnectedAdAccount } from "@/lib/ads/account-store";
import { getFreshCreativeThumbnail } from "@/lib/ads/graph-api";

export const dynamic = "force-dynamic";

// Mismo motivo que /api/media/[id]: el thumbnail_url del creativo es una URL
// firmada de Meta que expira, así que se pide una fresca en cada request.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const adDbId = Number(id);
  if (!Number.isFinite(adDbId)) return new NextResponse("Not found", { status: 404 });

  const ad = await db.query.ads.findFirst({ where: eq(ads.id, adDbId) });
  if (!ad) return new NextResponse("Not found", { status: 404 });

  if (ad.creativeId) {
    const account = await getConnectedAdAccount().catch(() => null);
    if (account) {
      const fresh = await getFreshCreativeThumbnail(ad.creativeId, account.accessToken).catch(() => null);
      if (fresh) {
        return NextResponse.redirect(fresh, {
          status: 302,
          headers: { "Cache-Control": "private, max-age=1800" },
        });
      }
    }
  }

  if (ad.thumbnailUrl) {
    return NextResponse.redirect(ad.thumbnailUrl, {
      status: 302,
      headers: { "Cache-Control": "private, max-age=1800" },
    });
  }

  return new NextResponse("No thumbnail", { status: 404 });
}
