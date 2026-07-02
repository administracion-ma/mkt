import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { applyMigration } from "@/lib/admin/migrate";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Legacy: preferir el botón en /admin. Se mantiene por si hace falta
// disparar la migración fuera del navegador. Protegida por x-admin-key.
export async function POST(request: NextRequest) {
  const key = request.headers.get("x-admin-key");
  if (!key || key !== env.tokenEncryptionKey) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await applyMigration();
  return NextResponse.json({ ok: true });
}
