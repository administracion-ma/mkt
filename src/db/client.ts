import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

declare global {
  var __dbClient: ReturnType<typeof postgres> | undefined;
}

function getClient() {
  if (!global.__dbClient) {
    // Cada función serverless de Vercel abre su propia instancia de este
    // cliente; sin tope, cada una podía abrir hasta 10 conexiones y agotar
    // el límite de Supabase con uso concurrente (2+ personas a la vez),
    // tumbando la app entera. max:3 acota eso sin serializar por completo
    // las páginas que hacen varias consultas en paralelo (Promise.all).
    global.__dbClient = postgres(env.databaseUrl, {
      prepare: false,
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      // Sin esto, una consulta trabada esperando un lock (ej: algo que quedó
      // pendiente de una migración anterior) se cuelga para siempre y ningún
      // timeout de fetch la frena — es Postgres, no HTTP.
      connection: { statement_timeout: 15000, idle_in_transaction_session_timeout: 15000 },
    });
  }
  return global.__dbClient;
}

export const db = drizzle(getClient(), { schema });
