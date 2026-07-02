import { classifyImportedPosts } from "../src/lib/pillars/classify";

classifyImportedPosts((msg) => console.log(msg))
  .then((result) => {
    console.log(`Listo. ${result.reclassified}/${result.total} reclasificados.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
