import { syncKommoLeads } from "../src/lib/kommo/sync";

async function main() {
  const { synced } = await syncKommoLeads();
  console.log(`${synced} lead(s) de Kommo sincronizados.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
