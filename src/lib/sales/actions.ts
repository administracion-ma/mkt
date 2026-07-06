"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { sales } from "@/db/schema";

export async function logSale(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const amount = Number(formData.get("amountUsd"));
  const occurredAtRaw = String(formData.get("occurredAt") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const campaignIdRaw = String(formData.get("campaignId") ?? "");

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "El monto tiene que ser un número mayor a 0." };
  }
  if (!occurredAtRaw) {
    return { ok: false, message: "Falta la fecha de la venta." };
  }

  await db.insert(sales).values({
    amountUsd: amount,
    occurredAt: new Date(`${occurredAtRaw}T12:00:00`),
    note: note || null,
    campaignId: campaignIdRaw ? Number(campaignIdRaw) : null,
  });

  revalidatePath("/ads");
  return { ok: true, message: `Venta de $${amount.toLocaleString("es-AR")} registrada.` };
}
