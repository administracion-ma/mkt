import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

declare global {
  var __dbClient: ReturnType<typeof postgres> | undefined;
}

function getClient() {
  if (!global.__dbClient) {
    global.__dbClient = postgres(env.databaseUrl, { prepare: false });
  }
  return global.__dbClient;
}

export const db = drizzle(getClient(), { schema });
