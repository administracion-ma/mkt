import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { igAccounts } from "../src/db/schema";
import { getConnectedAccount } from "../src/lib/instagram/account-store";
import { refreshLongLivedToken } from "../src/lib/instagram/oauth";
import { encryptSecret } from "../src/lib/crypto";

const REFRESH_THRESHOLD_DAYS = 30;

async function main() {
  const account = await getConnectedAccount();
  if (!account) {
    console.log("No hay ninguna cuenta de Instagram conectada.");
    return;
  }

  const daysLeft = Math.ceil(
    (account.tokenExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  console.log(`Token de @${account.igUsername} expira en ${daysLeft} días.`);

  if (daysLeft > REFRESH_THRESHOLD_DAYS) {
    console.log(`No necesita renovación todavía (umbral: ${REFRESH_THRESHOLD_DAYS} días).`);
    return;
  }

  console.log("Renovando token...");
  const { accessToken: newToken, expiresInSeconds } = await refreshLongLivedToken(
    account.accessToken
  );

  const newExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  const newDaysLeft = Math.ceil(expiresInSeconds / 86400);

  await db
    .update(igAccounts)
    .set({
      accessTokenEnc: encryptSecret(newToken),
      tokenExpiresAt: newExpiresAt,
      updatedAt: new Date(),
    })
    .where(eq(igAccounts.id, account.id));

  console.log(`Token renovado. Nuevo vencimiento: ${newDaysLeft} días (${newExpiresAt.toISOString().split("T")[0]}).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
