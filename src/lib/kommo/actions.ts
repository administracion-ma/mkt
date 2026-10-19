"use server";

import { revalidatePath } from "next/cache";
import { syncKommoLeads } from "@/lib/kommo/sync";

// Botón "Sincronizar Kommo ahora" en /admin — mismo patrón que runYoutubeSync/runAdsSync.
export async function runKommoSync(): Promise<{ ok: boolean; message: string }> {
  try {
    // Solo los últimos 60 días: el histórico completo (13 meses, decenas de
    // miles de leads) tarda varios minutos y lo hace el cron diario de GitHub;
    // desde el botón superaría el tiempo máximo de una función de Vercel.
    const { synced } = await syncKommoLeads(60, undefined, 10);
    revalidatePath("/kommo");
    return { ok: true, message: `${synced} lead(s) de los últimos 60 días sincronizados desde Kommo.` };
  } catch (err) {
    return { ok: false, message: describeError(err) };
  }
}

// DrizzleQueryError.message trae la consulta + params, pero la razón real del
// fallo (ej: tipo de dato inválido, columna faltante) vive en err.cause — a
// veces encadenado varios niveles, y no siempre es una instancia de Error
// "de verdad" (puede ser un objeto plano de postgres-js). Esto recorre toda
// la cadena y junta todo lo que tenga info legible, en vez de mostrar solo la
// consulta SQL sin decir por qué falló.
function describeError(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  let depth = 0;
  while (current != null && depth < 5) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
    } else if (typeof current === "string") {
      parts.push(current);
      current = null;
    } else {
      try {
        parts.push(JSON.stringify(current));
      } catch {
        parts.push(String(current));
      }
      current = null;
    }
    depth++;
  }
  return parts.length > 0 ? parts.join(" — ") : "Error desconocido";
}
