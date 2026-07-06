import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { posts } from "@/db/schema";
import { getConnectedAccount } from "@/lib/instagram/account-store";
import { getFreshMediaUrl } from "@/lib/instagram/graph-api";

export const dynamic = "force-dynamic";

// Redirige siempre a una URL de media vigente. Los posts importados desde
// Instagram guardan un media_url de la CDN de Meta que expira con el tiempo;
// este proxy pide uno fresco en cada request en vez de confiar en el guardado.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isFinite(postId)) return new NextResponse("Not found", { status: 404 });

  const post = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!post) return new NextResponse("Not found", { status: 404 });

  if (post.igMediaId) {
    const account = await getConnectedAccount().catch(() => null);
    if (account) {
      const fresh = await getFreshMediaUrl(post.igMediaId, account.accessToken).catch(() => null);
      if (fresh) {
        return NextResponse.redirect(fresh, {
          status: 302,
          headers: { "Cache-Control": "private, max-age=1800" },
        });
      }
    }
  }

  return NextResponse.redirect(post.mediaUrl, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=1800" },
  });
}
