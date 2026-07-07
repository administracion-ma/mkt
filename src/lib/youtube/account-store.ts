import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { youtubeAccounts } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/youtube/oauth";

interface SaveAccountInput {
  channelId: string;
  channelTitle: string;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export async function saveConnectedChannel(input: SaveAccountInput) {
  const tokenExpiresAt = new Date(Date.now() + input.expiresInSeconds * 1000);
  const existing = await db.query.youtubeAccounts.findFirst({ where: eq(youtubeAccounts.channelId, input.channelId) });

  const values = {
    channelId: input.channelId,
    channelTitle: input.channelTitle,
    accessTokenEnc: encryptSecret(input.accessToken),
    refreshTokenEnc: encryptSecret(input.refreshToken),
    tokenExpiresAt,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(youtubeAccounts).set(values).where(eq(youtubeAccounts.id, existing.id));
    return existing.id;
  }

  const [created] = await db.insert(youtubeAccounts).values(values).returning({ id: youtubeAccounts.id });
  return created.id;
}

// A diferencia de Meta (token de 60 días, se refresca por cron semanal), el
// access token de Google dura ~1h — así que se refresca acá mismo, en cada
// uso, si está por vencer. El refresh_token en sí no expira (salvo revocación).
export async function getConnectedYoutubeAccount(): Promise<{ channelId: string; channelTitle: string; accessToken: string } | null> {
  const account = await db.query.youtubeAccounts.findFirst({
    orderBy: (accounts, { desc }) => [desc(accounts.updatedAt)],
  });
  if (!account) return null;

  const expiresInMs = account.tokenExpiresAt.getTime() - Date.now();
  if (expiresInMs > 5 * 60 * 1000) {
    return { channelId: account.channelId, channelTitle: account.channelTitle, accessToken: decryptSecret(account.accessTokenEnc) };
  }

  const refreshToken = decryptSecret(account.refreshTokenEnc);
  const { accessToken, expiresInSeconds } = await refreshAccessToken(refreshToken);
  await db
    .update(youtubeAccounts)
    .set({ accessTokenEnc: encryptSecret(accessToken), tokenExpiresAt: new Date(Date.now() + expiresInSeconds * 1000), updatedAt: new Date() })
    .where(eq(youtubeAccounts.id, account.id));

  return { channelId: account.channelId, channelTitle: account.channelTitle, accessToken };
}
