import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

interface SaveAdAccountInput {
  adAccountId: string;
  accessToken: string;
  label?: string;
  currency?: string;
}

function normalizeAccountId(id: string): string {
  const trimmed = id.trim();
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}

export async function saveAdAccount(input: SaveAdAccountInput) {
  const adAccountId = normalizeAccountId(input.adAccountId);
  const existing = await db.query.adAccounts.findFirst({ where: eq(adAccounts.adAccountId, adAccountId) });

  const values = {
    adAccountId,
    label: input.label ?? null,
    currency: input.currency ?? "USD",
    accessTokenEnc: encryptSecret(input.accessToken),
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(adAccounts).set(values).where(eq(adAccounts.id, existing.id));
    return existing.id;
  }

  const [created] = await db.insert(adAccounts).values(values).returning({ id: adAccounts.id });
  return created.id;
}

// Actualiza solo la moneda — usado por el sync para autocorregirla en cuentas
// que se conectaron antes de que este campo existiera, sin pedir reconectar.
export async function updateAdAccountCurrency(id: number, currency: string) {
  await db.update(adAccounts).set({ currency, updatedAt: new Date() }).where(eq(adAccounts.id, id));
}

export async function getConnectedAdAccount() {
  const account = await db.query.adAccounts.findFirst({
    orderBy: (accounts, { desc }) => [desc(accounts.updatedAt)],
  });
  if (!account) return null;
  return {
    ...account,
    accessToken: decryptSecret(account.accessTokenEnc),
  };
}
