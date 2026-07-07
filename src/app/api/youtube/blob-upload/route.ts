import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Los videos de YouTube pesan mucho más que 1MB (el límite por defecto de un
// Server Action) — se suben directo del navegador a Vercel Blob, y esta ruta
// solo emite el token de subida. Ver componentes/YoutubeVideoForm.tsx.
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["video/mp4", "video/quicktime", "video/x-m4v", "video/webm"],
        addRandomSuffix: true,
        maximumSizeInBytes: 5 * 1024 * 1024 * 1024,
      }),
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error desconocido" }, { status: 400 });
  }
}
