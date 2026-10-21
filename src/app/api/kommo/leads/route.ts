import { NextResponse, type NextRequest } from "next/server";
import { and, desc, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { kommoLeads } from "@/db/schema";
import { env } from "@/lib/env";
import { getPipelines } from "@/lib/kommo/api";
import { buildMatcher } from "@/lib/kommo/drilldown";
import { CHANNEL_LABEL } from "@/lib/kommo/insights";

// Listado de leads detrás de una estadística de /kommo (el pop-up que se abre
// al clickearla). Se pide recién al hacer click, para no cargar miles de
// leads en la página de entrada.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_ROWS = 2000;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const from = new Date(p.get("from") ?? "");
  const to = new Date(p.get("to") ?? "");
  const filter = p.get("f") ?? "all";
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  }

  try {
    const [pipelines, leads] = await Promise.all([
      getPipelines(),
      db.query.kommoLeads.findMany({
        where: and(gte(kommoLeads.kommoCreatedAt, from), lte(kommoLeads.kommoCreatedAt, to)),
        orderBy: desc(kommoLeads.kommoCreatedAt),
      }),
    ]);
    const matches = buildMatcher(filter, pipelines);
    const stageName = new Map<string, string>(pipelines.flatMap((pl) => pl.statuses.map((s) => [`${pl.id}:${s.id}`, s.name] as [string, string])));
    const pipelineName = new Map(pipelines.map((pl) => [String(pl.id), pl.name.trim()]));

    const matched = leads.filter(matches);
    const rows = matched.slice(0, MAX_ROWS).map((l) => ({
      id: l.kommoLeadId,
      name: l.name ?? `Lead #${l.kommoLeadId}`,
      createdAt: l.kommoCreatedAt.toISOString(),
      stage: stageName.get(`${l.pipelineId}:${l.statusId}`) ?? "—",
      pipeline: pipelineName.get(l.pipelineId ?? "") ?? "—",
      channel: CHANNEL_LABEL[l.channel ?? "none"] ?? l.channel ?? "—",
      url: `https://${env.kommoSubdomain}.kommo.com/leads/detail/${l.kommoLeadId}`,
    }));
    return NextResponse.json({ total: matched.length, rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
