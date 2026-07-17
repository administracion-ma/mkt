import { getConnectedTiktokAccount } from "../src/lib/tiktok/account-store";
import { syncAllTiktok } from "../src/lib/tiktok/sync";

async function main() {
  const account = await getConnectedTiktokAccount();
  if (!account) {
    console.log("No hay ninguna cuenta de TikTok conectada.");
    return;
  }

  const { imported, synced } = await syncAllTiktok(account);
  console.log(`Cuenta actualizada. ${imported} video(s) nuevo(s), ${synced} sincronizados.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
