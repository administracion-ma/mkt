"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adCampaigns } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { verifyAdAccount } from "@/lib/ads/graph-api";
import { saveAdAccount, getConnectedAdAccount } from "@/lib/ads/account-store";
import { syncAdData } from "@/lib/ads/sync";

export async function connectAdAccount(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const adAccountId = String(formData.get("adAccountId") ?? "").trim();
  const accessToken = String(formData.get("accessToken") ?? "").trim();

  if (!adAccountId || !accessToken) {
    return { ok: false, message: "Faltan datos: ID de cuenta y token son obligatorios." };
  }

  const normalizedId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

  try {
    const info = await verifyAdAccount(normalizedId, accessToken);
    await saveAdAccount({ adAccountId: normalizedId, accessToken, label: info.name, currency: info.currency });
    return { ok: true, message: `Conectado a "${info.name}" (${info.currency}). Ahora podés sincronizar la pauta.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "No se pudo verificar la cuenta. Revisá el ID y el token." };
  }
}

// Asignación manual de pilar a campaña — la base del cruce orgánico+pauta:
// sin esto no hay forma de saber a qué pilar de contenido corresponde el
// gasto de una campaña.
export async function assignCampaignPillar(campaignId: number, pillarId: number | null): Promise<void> {
  await db.update(adCampaigns).set({ pillarId, updatedAt: new Date() }).where(eq(adCampaigns.id, campaignId));
  revalidatePath("/ads");
}

export async function runAdsSync(): Promise<{ ok: boolean; message: string }> {
  try {
    const account = await getConnectedAdAccount();
    if (!account) return { ok: false, message: "No hay ninguna cuenta de Meta Ads conectada todavía." };
    const result = await syncAdData(account);
    return {
      ok: true,
      message: `${result.campaigns} campaña(s) (${result.insightRows} día-campaña), ${result.ads} anuncio(s) (${result.adInsightRows} día-anuncio) sincronizados.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error desconocido" };
  }
}
