import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adCampaigns, adInsights } from "@/db/schema";
import { getCampaigns, getDailyCampaignInsights } from "@/lib/ads/graph-api";

type AdAccount = { adAccountId: string; accessToken: string };

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

// Trae campañas + desglose diario de los últimos `daysBack` días y los
// upsertea. daysBack por default cubre de sobra el intervalo entre corridas
// del cron (1x/día) incluso si alguna corrida falla.
export async function syncAdData(account: AdAccount, daysBack = 14): Promise<{ campaigns: number; insightRows: number }> {
  const campaigns = await getCampaigns(account.adAccountId, account.accessToken);

  const campaignIdMap = new Map<string, number>();
  for (const c of campaigns) {
    const existing = await db.query.adCampaigns.findFirst({ where: eq(adCampaigns.campaignId, c.id) });
    if (existing) {
      await db
        .update(adCampaigns)
        .set({ name: c.name, objective: c.objective ?? null, status: c.status, updatedAt: new Date() })
        .where(eq(adCampaigns.id, existing.id));
      campaignIdMap.set(c.id, existing.id);
    } else {
      const [created] = await db
        .insert(adCampaigns)
        .values({ campaignId: c.id, name: c.name, objective: c.objective ?? null, status: c.status })
        .returning({ id: adCampaigns.id });
      campaignIdMap.set(c.id, created.id);
    }
  }

  if (campaigns.length === 0) {
    return { campaigns: 0, insightRows: 0 };
  }

  const until = new Date();
  const since = new Date(until.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const dailyRows = await getDailyCampaignInsights(account.adAccountId, account.accessToken, fmtDate(since), fmtDate(until));

  let insightRows = 0;
  for (const row of dailyRows) {
    const localCampaignId = campaignIdMap.get(row.campaignId);
    if (!localCampaignId) continue; // campaña archivada hace mucho, no vino en el listado

    const date = new Date(`${row.date}T00:00:00Z`);
    const existing = await db.query.adInsights.findFirst({
      where: and(eq(adInsights.campaignId, localCampaignId), eq(adInsights.date, date)),
    });

    const values = {
      campaignId: localCampaignId,
      date,
      spend: row.spend,
      impressions: row.impressions,
      reach: row.reach,
      clicks: row.clicks,
      linkClicks: row.linkClicks,
      cpc: row.cpc,
      cpm: row.cpm,
      ctr: row.ctr,
      results: row.results,
      capturedAt: new Date(),
    };

    if (existing) {
      await db.update(adInsights).set(values).where(eq(adInsights.id, existing.id));
    } else {
      await db.insert(adInsights).values(values);
    }
    insightRows++;
  }

  return { campaigns: campaigns.length, insightRows };
}
