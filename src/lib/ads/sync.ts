import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adCampaigns, adInsights, ads, adCreativeInsights } from "@/db/schema";
import { getCampaigns, getDailyCampaignInsights, getAds, getDailyAdInsights, verifyAdAccount } from "@/lib/ads/graph-api";
import { updateAdAccountCurrency } from "@/lib/ads/account-store";

type AdAccount = { id: number; adAccountId: string; accessToken: string };

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

// Trae campañas + desglose diario de los últimos `daysBack` días y los
// upsertea. daysBack por default cubre de sobra el intervalo entre corridas
// del cron (1x/día) incluso si alguna corrida falla.
export async function syncAdData(
  account: AdAccount,
  daysBack = 14
): Promise<{ campaigns: number; insightRows: number; ads: number; adInsightRows: number }> {
  // Autocorrige la moneda guardada — cubre cuentas conectadas antes de que
  // este campo existiera, sin tener que pedir que reconecten.
  await verifyAdAccount(account.adAccountId, account.accessToken)
    .then((info) => updateAdAccountCurrency(account.id, info.currency))
    .catch(() => {});

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
    return { campaigns: 0, insightRows: 0, ads: 0, adInsightRows: 0 };
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

  // ── Anuncios individuales (creativo + desglose diario) ─────────────────────
  const adList = await getAds(account.adAccountId, account.accessToken);

  const adIdMap = new Map<string, number>();
  for (const a of adList) {
    const localCampaignId = campaignIdMap.get(a.campaignId);
    if (!localCampaignId) continue; // anuncio de una campaña que no vino en el listado

    const existing = await db.query.ads.findFirst({ where: eq(ads.adId, a.id) });
    const values = {
      campaignId: localCampaignId,
      name: a.name,
      status: a.status,
      creativeId: a.creativeId,
      thumbnailUrl: a.thumbnailUrl,
      isVideo: a.isVideo,
      updatedAt: new Date(),
    };
    if (existing) {
      await db.update(ads).set(values).where(eq(ads.id, existing.id));
      adIdMap.set(a.id, existing.id);
    } else {
      const [created] = await db.insert(ads).values({ adId: a.id, ...values }).returning({ id: ads.id });
      adIdMap.set(a.id, created.id);
    }
  }

  let adInsightRows = 0;
  if (adList.length > 0) {
    const dailyAdRows = await getDailyAdInsights(account.adAccountId, account.accessToken, fmtDate(since), fmtDate(until));

    for (const row of dailyAdRows) {
      const localAdId = adIdMap.get(row.adId);
      if (!localAdId) continue;

      const date = new Date(`${row.date}T00:00:00Z`);
      const existing = await db.query.adCreativeInsights.findFirst({
        where: and(eq(adCreativeInsights.adId, localAdId), eq(adCreativeInsights.date, date)),
      });

      const values = {
        adId: localAdId,
        date,
        spend: row.spend,
        impressions: row.impressions,
        reach: row.reach,
        clicks: row.clicks,
        linkClicks: row.linkClicks,
        cpc: row.cpc,
        cpm: row.cpm,
        ctr: row.ctr,
        frequency: row.frequency,
        results: row.results,
        capturedAt: new Date(),
      };

      if (existing) {
        await db.update(adCreativeInsights).set(values).where(eq(adCreativeInsights.id, existing.id));
      } else {
        await db.insert(adCreativeInsights).values(values);
      }
      adInsightRows++;
    }
  }

  return { campaigns: campaigns.length, insightRows, ads: adList.length, adInsightRows };
}
