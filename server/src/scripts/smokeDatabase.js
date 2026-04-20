import {
  closeDatabaseConnections,
  connectToDatabase,
  initializeDatabaseStructure
} from "../config/database.js";
import { env } from "../config/env.js";

async function run() {
  console.log(`Checking MongoDB connection for ${env.mongodbUriSafe}`);

  try {
    await connectToDatabase();
    const summary = await initializeDatabaseStructure();
    const topologyLabel = summary.databases
      .map((database) => `${database.alias}:${database.databaseName}`)
      .join(", ");
    console.log(`MongoDB smoke test connected successfully across ${topologyLabel}.`);
  } catch (error) {
    console.error("MongoDB smoke test failed.");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await closeDatabaseConnections().catch(() => {});
  }
}

run();
