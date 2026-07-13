import { getConnectedYoutubeAccount } from "../src/lib/youtube/account-store";
import { syncAllYoutube } from "../src/lib/youtube/sync";

async function main() {
  const account = await getConnectedYoutubeAccount();
  if (!account) {
    console.log("No hay ningún canal de YouTube conectado.");
    return;
  }

  const { synced, total } = await syncAllYoutube(account);
  console.log(`Canal actualizado. ${synced} de ${total} video(s) sincronizados.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
