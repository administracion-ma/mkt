"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { brandProfile } from "@/db/schema";
import { eq } from "drizzle-orm";
import { BRAND_PROFILE_DRAFT } from "@/lib/brand/draft";

export async function getBrandProfile(): Promise<string> {
  const row = await db.query.brandProfile.findFirst();
  return row?.content ?? BRAND_PROFILE_DRAFT;
}

export async function saveBrandProfile(formData: FormData): Promise<void> {
  const content = String(formData.get("content") ?? "").trim();

  const existing = await db.query.brandProfile.findFirst();
  if (existing) {
    await db.update(brandProfile).set({ content, updatedAt: new Date() }).where(eq(brandProfile.id, existing.id));
  } else {
    await db.insert(brandProfile).values({ content });
  }

  revalidatePath("/settings");
}
