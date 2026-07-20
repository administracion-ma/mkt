import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

// Diagnóstico aislado de la base de datos: corre un `select 1` trivial con un
// tope propio de 8s. Sirve para separar "la DB no responde" de "la página de
// inicio hace algo lento". Si esto responde rápido con ok:true, la conexión
// está sana y el problema está en otra parte; si tarda/tira error, el problema
// es la conexión (URL, credenciales, o el pooler saturado).
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  const start = Date.now();
  try {
    await Promise.race([
      db.execute(sql`select 1 as ok`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("La consulta no respondió en 8s (timeout del diagnóstico)")), 8000),
      ),
    ]);
    return NextResponse.json({ ok: true, elapsedMs: Date.now() - start });
  } catch (e) {
    return NextResponse.json(
      { ok: false, elapsedMs: Date.now() - start, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
