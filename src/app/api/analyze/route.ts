import { NextRequest, NextResponse } from "next/server";
import { resolvePeriod } from "@/lib/analysis-payload";
import { runOrganicAnalysis } from "@/lib/analysis/run-organic";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { from, to } = resolvePeriod(body.from, body.to);

  const result = await runOrganicAnalysis(from, to);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ id: result.id, summary: result.summary, createdAt: result.createdAt });
}
