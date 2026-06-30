import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { igAccounts } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

interface SaveAccountInput {
  igUserId: string;
  igUsername: string;
  accessToken: string;
  expiresInSeconds: number;
}

export async function saveConnectedAccount(input: SaveAccountInput) {
  const tokenExpiresAt = new Date(Date.now() + input.expiresInSeconds * 1000);
  const existing = await db.query.igAccounts.findFirst({
    where: eq(igAccounts.igUserId, input.igUserId),
  });

  const values = {
    igUserId: input.igUserId,
    igUsername: input.igUsername,
    accessTokenEnc: encryptSecret(input.accessToken),
    tokenExpiresAt,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(igAccounts).set(values).where(eq(igAccounts.id, existing.id));
    return existing.id;
  }

  const [created] = await db.insert(igAccounts).values(values).returning({ id: igAccounts.id });
  return created.id;
}

export async function getConnectedAccount() {
  const account = await db.query.igAccounts.findFirst({
    orderBy: (accounts, { desc }) => [desc(accounts.updatedAt)],
  });
  if (!account) {
    return null;
  }
  return {
    ...account,
    accessToken: decryptSecret(account.accessTokenEnc),
  };
}
