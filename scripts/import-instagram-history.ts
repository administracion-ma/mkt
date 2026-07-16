import { getConnectedAccount } from "../src/lib/instagram/account-store";
import { importAllMedia } from "../src/lib/instagram/import";

async function main() {
  const account = await getConnectedAccount();
  if (!account) {
    console.log("No hay ninguna cuenta de Instagram conectada.");
    return;
  }

  console.log(`Obteniendo historial de @${account.igUsername}...`);
  const { imported, total } = await importAllMedia(account);
  console.log(`Total de posts en Instagram: ${total}`);
  console.log(`\nFin: ${imported} importados, ${total - imported} ya existían en la base de datos.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
