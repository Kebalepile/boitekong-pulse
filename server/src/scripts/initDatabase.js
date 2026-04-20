import {
  closeDatabaseConnections,
  connectToDatabase,
  initializeDatabaseStructure
} from "../config/database.js";
import { env } from "../config/env.js";

async function run() {
  await connectToDatabase();
  const summary = await initializeDatabaseStructure();

  summary.databases.forEach((database) => {
    console.log(
      `Database alias "${database.alias}" -> "${database.databaseName}" is ready with ${database.collections.length} collections.`
    );

    if (database.createdCollections.length > 0) {
      console.log(`[${database.alias}] created: ${database.createdCollections.join(", ")}`);
      return;
    }

    console.log(`[${database.alias}] no new collections needed to be created.`);
  });

  console.log(`Core connection target: ${env.mongodbUriSafe}`);
  await closeDatabaseConnections();
}

run().catch(async (error) => {
  console.error("Failed to initialize MongoDB.");
  console.error(error.message);

  try {
    await closeDatabaseConnections();
  } catch {
    // Ignore disconnect errors during failed startup.
  }

  process.exit(1);
});
