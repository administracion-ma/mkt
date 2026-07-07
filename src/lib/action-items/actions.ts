"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { actionItems } from "@/db/schema";

export async function setActionItemStatus(id: number, status: "done" | "dismissed" | "open"): Promise<void> {
  await db
    .update(actionItems)
    .set({ status, resolvedAt: status === "open" ? null : new Date() })
    .where(eq(actionItems.id, id));

  revalidatePath("/");
  revalidatePath("/resumenes");
}

export async function getOpenActionItems() {
  return db.query.actionItems.findMany({
    where: eq(actionItems.status, "open"),
    orderBy: (a, { desc }) => [desc(a.createdAt)],
  });
}
