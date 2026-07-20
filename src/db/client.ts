import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

declare global {
  var __dbClient: ReturnType<typeof postgres> | undefined;
}

function getClient() {
  if (!global.__dbClient) {
    // IMPORTANTE: acá van SOLO opciones del pool (lado cliente de postgres-js),
    // NUNCA parámetros del servidor (statement_timeout,
    // idle_in_transaction_session_timeout, etc). Esos se mandan en el startup
    // packet y el pooler de Supabase (pgBouncer, modo transacción) los rechaza
    // → conexión falla → 504. Ese fue el error de intentos anteriores.
    //
    // Por qué esta config y no los defaults de postgres-js:
    //  - connect_timeout default = 30s == maxDuration de la función. Si el
    //    límite de conexiones de Supabase está lleno, la query espera 30s y
    //    Vercel mata la función → 504 FUNCTION_INVOCATION_TIMEOUT. Con 10s
    //    falla rápido y cae en los .catch() de cada página (se ve un guion en
    //    vez de tumbarse toda la app).
    //  - idle_timeout default = 0 = las conexiones NO se cierran nunca. Cada
    //    instancia serverless de Vercel las va acumulando y agota el límite de
    //    Supabase. Con 20s se liberan y dejan lugar a otras instancias.
    //  - max: tope de conexiones por instancia. Confirmado con diagnóstico en
    //    producción: con max:5 y una página disparando ~13 queries a la vez
    //    con Promise.all, un par de ellas quedaban colgadas 12s+ esperando
    //    conexión libre (aunque cada query sola tardaba <500ms) — el pipelining
    //    de postgres-js no compensaba bien contra el pooler de Supabase bajo
    //    esa concurrencia. El pooler en modo transacción está pensado para
    //    aguantar bastante más que esto, así que subir el tope de este lado es
    //    seguro. Combinar con runLimited() abajo para no volver a mandar
    //    ráfagas grandes sin control.
    // prepare:false es obligatorio para el pooler en modo transacción.
    global.__dbClient = postgres(env.databaseUrl, {
      prepare: false,
      max: 15,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return global.__dbClient;
}

export const db = drizzle(getClient(), { schema });

// Red de seguridad: corre una consulta con un tope de tiempo y, si se pasa (o
// falla), devuelve un valor por defecto en vez de dejar la página colgada hasta
// el timeout de la función (30s → 504). Ninguna consulta lenta puede volver a
// tumbar una página: en el peor caso se ve un guion y el resto carga igual.
export async function withTimeout<T, F = T>(promise: Promise<T>, fallback: F, ms = 9000): Promise<T | F> {
  try {
    return await Promise.race([
      promise,
      new Promise<F>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);
  } catch {
    return fallback;
  }
}

// Corre varias consultas con como máximo `limit` en simultáneo, en vez de un
// Promise.all sin freno. Páginas como el panel de inicio disparaban ~13
// queries a la vez sobre el mismo pool y algunas quedaban colgadas 12s+
// esperando su turno (visto en producción con /api/health/*), aun con más
// conexiones disponibles. Corriendo de a `limit` por tanda se evita esa
// ráfaga. Devuelve los resultados en el mismo orden que las tareas de entrada
// (tipado como tupla, igual que Promise.all, para no perder el tipo de cada
// consulta al desestructurar).
export async function runLimited<T extends readonly (() => Promise<unknown>)[]>(
  tasks: T,
  limit = 6,
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results: unknown[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results as { [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
