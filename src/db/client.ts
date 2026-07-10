import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

declare global {
  var __dbClient: ReturnType<typeof postgres> | undefined;
}

function getClient() {
  if (!global.__dbClient) {
    // max:1 — cada función serverless de Vercel abre su propia instancia de
    // este cliente; sin este límite, cada una podía abrir hasta 10 conexiones
    // y agotar el límite de Supabase apenas hay uso concurrente (2+ personas
    // a la vez), tumbando la app entera.
    global.__dbClient = postgres(env.databaseUrl, { prepare: false, max: 1 });
  }
  return global.__dbClient;
}

export const db = drizzle(getClient(), { schema });
