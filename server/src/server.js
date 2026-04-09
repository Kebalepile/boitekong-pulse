import { createApp } from "./app.js";
import {
  connectToDatabase,
  initializeDatabaseStructure
} from "./config/database.js";
import { env } from "./config/env.js";

let server;

async function startServer() {
  await connectToDatabase();
  const databaseSummary = await initializeDatabaseStructure();

  const app = createApp();

  server = app.listen(env.port, () => {
    console.log(`Boitekong Pulse API listening on port ${env.port}`);
    console.log(
      `MongoDB connected to ${databaseSummary.databaseName} with ${databaseSummary.collections.length} collections ready.`
    );
  });
}

async function shutdown(signal) {
  if (server) {
    server.close(() => {
      console.log(`Received ${signal}. Server closed.`);
      process.exit(0);
    });
    return;
  }

  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

startServer().catch((error) => {
  console.error("Failed to start API server.");
  console.error(error);
  process.exit(1);
});
