import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokAccounts } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/tiktok/oauth";

interface SaveAccountInput {
  openId: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export async function saveConnectedTiktokAccount(input: SaveAccountInput) {
  const tokenExpiresAt = new Date(Date.now() + input.expiresInSeconds * 1000);
  const existing = await db.query.tiktokAccounts.findFirst({ where: eq(tiktokAccounts.openId, input.openId) });

  const values = {
    openId: input.openId,
    displayName: input.displayName,
    accessTokenEnc: encryptSecret(input.accessToken),
    refreshTokenEnc: encryptSecret(input.refreshToken),
    tokenExpiresAt,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(tiktokAccounts).set(values).where(eq(tiktokAccounts.id, existing.id));
    return existing.id;
  }

  const [created] = await db.insert(tiktokAccounts).values(values).returning({ id: tiktokAccounts.id });
  return created.id;
}

// El access token de TikTok dura ~24h y el refresh token ~1 año — se
// refresca solo en cada uso si está por vencer, mismo patrón que YouTube.
// TikTok además ROTA el refresh_token en cada refresh, así que hay que
// persistir el nuevo siempre (no solo el access token).
export async function getConnectedTiktokAccount(): Promise<{ openId: string; displayName: string; accessToken: string } | null> {
  const account = await db.query.tiktokAccounts.findFirst({
    orderBy: (accounts, { desc }) => [desc(accounts.updatedAt)],
  });
  if (!account) return null;

  const expiresInMs = account.tokenExpiresAt.getTime() - Date.now();
  if (expiresInMs > 30 * 60 * 1000) {
    return { openId: account.openId, displayName: account.displayName, accessToken: decryptSecret(account.accessTokenEnc) };
  }

  const refreshToken = decryptSecret(account.refreshTokenEnc);
  const { accessToken, refreshToken: newRefreshToken, expiresInSeconds } = await refreshAccessToken(refreshToken);
  await db
    .update(tiktokAccounts)
    .set({
      accessTokenEnc: encryptSecret(accessToken),
      refreshTokenEnc: encryptSecret(newRefreshToken),
      tokenExpiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      updatedAt: new Date(),
    })
    .where(eq(tiktokAccounts.id, account.id));

  return { openId: account.openId, displayName: account.displayName, accessToken };
}
