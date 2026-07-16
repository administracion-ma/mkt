"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { marketingGoals } from "@/db/schema";

export type Goals = {
  monthlyAdBudgetUsd: number | null;
  monthlySalesTargetUsd: number | null;
  weeklyPostsTarget: number | null;
};

export async function getGoals(): Promise<Goals | null> {
  const row = await db.query.marketingGoals.findFirst().catch(() => null);
  if (!row) return null;
  return {
    monthlyAdBudgetUsd: row.monthlyAdBudgetUsd,
    monthlySalesTargetUsd: row.monthlySalesTargetUsd,
    weeklyPostsTarget: row.weeklyPostsTarget,
  };
}

function numOrNull(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function saveGoals(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const values = {
    monthlyAdBudgetUsd: numOrNull(formData, "monthlyAdBudgetUsd"),
    monthlySalesTargetUsd: numOrNull(formData, "monthlySalesTargetUsd"),
    weeklyPostsTarget: numOrNull(formData, "weeklyPostsTarget"),
    updatedAt: new Date(),
  };

  const existing = await db.query.marketingGoals.findFirst();
  if (existing) {
    await db.update(marketingGoals).set(values).where(eq(marketingGoals.id, existing.id));
  } else {
    await db.insert(marketingGoals).values(values);
  }

  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true, message: "Metas guardadas." };
}
