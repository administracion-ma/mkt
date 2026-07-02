"use server";

import { classifyImportedPosts, fixMisclassifiedGraphics } from "@/lib/pillars/classify";
import { applyMigration } from "@/lib/admin/migrate";

export async function runMigration(): Promise<{ ok: boolean; message: string }> {
  try {
    await applyMigration();
    return { ok: true, message: "Migración aplicada correctamente: tablas, columnas, pilares/editores y ficha de marca listos." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error desconocido" };
  }
}

export async function runClassification(): Promise<{ ok: boolean; message: string }> {
  try {
    const logs: string[] = [];
    const result = await classifyImportedPosts((msg) => logs.push(msg));
    return {
      ok: true,
      message: `${result.reclassified} de ${result.total} posts asignados a un pilar real. ${result.movedToFallback} sin tema claro (quedaron en Importado).\n\n${logs.join("\n")}`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error desconocido" };
  }
}

export async function runFixGraphics(): Promise<{ ok: boolean; message: string }> {
  try {
    const logs: string[] = [];
    const result = await fixMisclassifiedGraphics((msg) => logs.push(msg));
    return {
      ok: true,
      message: `${result.total} reel(s)/video(s) sacados de Post gráfico: ${result.reclassified} a un pilar real, ${result.movedToFallback} a Importado (sin tema claro).\n\n${logs.join("\n")}`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error desconocido" };
  }
}
