import { applyMigration } from "../src/lib/admin/migrate";
import { syncKommoLeads } from "../src/lib/kommo/sync";

async function main() {
  // Idempotente y rápida: garantiza que existan las columnas que usa el sync
  // aunque este workflow corra antes de que termine el deploy de Vercel.
  await applyMigration();
  const { synced } = await syncKommoLeads();
  console.log(`${synced} lead(s) de Kommo sincronizados.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
