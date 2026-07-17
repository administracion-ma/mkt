import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Mismo patrón que /api/youtube/blob-upload: el video se sube directo del
// navegador a Vercel Blob (bypassea el límite de 1MB de los Server Actions).
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["video/mp4", "video/quicktime", "video/x-m4v", "video/webm"],
        addRandomSuffix: true,
        maximumSizeInBytes: 500 * 1024 * 1024, // TikTok limita a 4GB, pero un video vertical corto no debería acercarse ni a esto
      }),
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error desconocido" }, { status: 400 });
  }
}
