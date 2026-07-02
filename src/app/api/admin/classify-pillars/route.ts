import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { classifyImportedPosts } from "@/lib/pillars/classify";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Reclasifica con IA los posts históricos que quedaron en el pilar "importado".
// Protegida: requiere el header x-admin-key igual a TOKEN_ENCRYPTION_KEY.
export async function POST(request: NextRequest) {
  const key = request.headers.get("x-admin-key");
  if (!key || key !== env.tokenEncryptionKey) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const logs: string[] = [];
  const result = await classifyImportedPosts((msg) => logs.push(msg));

  return NextResponse.json({ ok: true, ...result, logs });
}
