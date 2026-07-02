import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Migraciones idempotentes (mismas que scripts/migrate.ts).
// Protegida: requiere el header x-admin-key igual a TOKEN_ENCRYPTION_KEY.
export async function POST(request: NextRequest) {
  const key = request.headers.get("x-admin-key");
  if (!key || key !== env.tokenEncryptionKey) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS account_metrics (
      id serial PRIMARY KEY,
      captured_at timestamptz NOT NULL DEFAULT now(),
      followers_count integer,
      media_count integer
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS analysis_reports (
      id serial PRIMARY KEY,
      period_from timestamptz NOT NULL,
      period_to timestamptz NOT NULL,
      summary text NOT NULL,
      model_used text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  return NextResponse.json({ ok: true, applied: ["account_metrics", "analysis_reports"] });
}
