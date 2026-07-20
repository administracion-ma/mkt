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
    //  - max: tope de conexiones por instancia. postgres-js hace pipelining
    //    sobre cada conexión, así que 5 alcanzan de sobra para las páginas que
    //    lanzan varias queries en paralelo, sin arriesgar agotar Supabase.
    // prepare:false es obligatorio para el pooler en modo transacción.
    global.__dbClient = postgres(env.databaseUrl, {
      prepare: false,
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return global.__dbClient;
}

export const db = drizzle(getClient(), { schema });
