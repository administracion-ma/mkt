"use server";

import { revalidatePath } from "next/cache";
import { syncKommoLeads } from "@/lib/kommo/sync";

// Botón "Sincronizar Kommo ahora" en /admin — mismo patrón que runYoutubeSync/runAdsSync.
export async function runKommoSync(): Promise<{ ok: boolean; message: string }> {
  try {
    const { synced } = await syncKommoLeads();
    revalidatePath("/kommo");
    return { ok: true, message: `${synced} lead(s) sincronizados desde Kommo.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error desconocido" };
  }
}
