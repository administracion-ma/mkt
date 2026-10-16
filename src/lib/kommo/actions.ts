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
    // DrizzleQueryError.message trae la consulta + params, pero la razón real
    // del fallo (ej: tipo de dato inválido, columna faltante) vive en
    // err.cause — sin esto el error mostrado en pantalla no dice nada útil.
    const cause = err instanceof Error && err.cause instanceof Error ? ` — ${err.cause.message}` : "";
    return { ok: false, message: (err instanceof Error ? err.message : "Error desconocido") + cause };
  }
}
