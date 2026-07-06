import { runOrganicAnalysis } from "../src/lib/analysis/run-organic";
import { runAdsAnalysis } from "../src/lib/analysis/run-ads";

async function main() {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

  console.log(`Generando informes de la semana ${from.toISOString().slice(0, 10)} a ${to.toISOString().slice(0, 10)}...`);

  console.log("-> Instagram orgánico...");
  const organic = await runOrganicAnalysis(from, to);
  console.log(organic.ok ? `   OK (informe #${organic.id})` : `   Sin informe: ${organic.error}`);

  console.log("-> Meta Ads...");
  const ads = await runAdsAnalysis(from, to);
  console.log(ads.ok ? `   OK (informe #${ads.id})` : `   Sin informe: ${ads.error}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
