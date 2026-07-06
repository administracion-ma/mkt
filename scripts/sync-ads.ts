import { getConnectedAdAccount } from "../src/lib/ads/account-store";
import { syncAdData } from "../src/lib/ads/sync";

async function main() {
  const account = await getConnectedAdAccount();
  if (!account) {
    console.log("No hay ninguna cuenta de Meta Ads conectada.");
    return;
  }

  console.log(`Sincronizando pauta de ${account.adAccountId}...`);
  const result = await syncAdData(account);
  console.log(`OK: ${result.campaigns} campaña(s), ${result.insightRows} día(s)-campaña sincronizados.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
