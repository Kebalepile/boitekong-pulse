import mongoose from "mongoose";
import {
  connectToDatabase,
  initializeDatabaseStructure
} from "../config/database.js";
import { env } from "../config/env.js";

async function run() {
  await connectToDatabase();
  const summary = await initializeDatabaseStructure();

  console.log(
    `Database "${summary.databaseName}" is ready with ${summary.collections.length} collections.`
  );

  if (summary.createdCollections.length > 0) {
    console.log(`Created collections: ${summary.createdCollections.join(", ")}`);
  } else {
    console.log("No new collections needed to be created.");
  }

  console.log(`Connection target: ${env.mongodbUriSafe}`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("Failed to initialize MongoDB.");
  console.error(error.message);

  try {
    await mongoose.disconnect();
  } catch {
    // Ignore disconnect errors during failed startup.
  }

  process.exit(1);
});
