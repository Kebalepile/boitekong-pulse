import { connectToDatabase } from "../config/database.js";
import { env } from "../config/env.js";

async function run() {
  console.log(`Checking MongoDB connection for ${env.mongodbUriSafe}`);

  try {
    await connectToDatabase();
    console.log("MongoDB smoke test connected successfully.");
  } catch (error) {
    console.error("MongoDB smoke test failed.");
    console.error(error);
    process.exitCode = 1;
  }
}

run();
