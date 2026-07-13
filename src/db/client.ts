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
    // Config mínima a propósito: los intentos de "mejorarla" (max bajo,
    // idle_timeout agresivo, statement_timeout vía startup packet) causaron
    // cuelgues y 504 intermitentes — el pooler de Supabase no se lleva bien
    // con esos parámetros. Esta es la config que corrió estable en producción.
    global.__dbClient = postgres(env.databaseUrl, { prepare: false });
  }
  return global.__dbClient;
}

export const db = drizzle(getClient(), { schema });
