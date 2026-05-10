import { createServer } from "node:http";
import { createApp } from "./app.js";
import {
  closeDatabaseConnections,
  connectToDatabase,
  initializeDatabaseStructure
} from "./config/database.js";
import { env } from "./config/env.js";
import {
  attachRealtimeServer,
  closeRealtimeServer
} from "./services/realtimeService.js";

let server;

async function startServer() {
  await connectToDatabase();
  const databaseSummary = await initializeDatabaseStructure();

  const app = createApp();
  server = createServer(app);
  server.requestTimeout = env.requestTimeoutMs;
  server.headersTimeout = env.headersTimeoutMs;
  server.keepAliveTimeout = env.keepAliveTimeoutMs;
  attachRealtimeServer(server);

  server.listen(env.port, () => {
    console.log(`yahneh API listening on port ${env.port}`);
    const topologyLabel = databaseSummary.databases
      .map((database) => `${database.alias}:${database.databaseName}`)
      .join(", ");
    console.log(`MongoDB ready across ${topologyLabel}.`);
  });
}

async function shutdown(signal) {
  closeRealtimeServer();

  if (server) {
    server.close(() => {
      console.log(`Received ${signal}. Server closed.`);
      void closeDatabaseConnections().finally(() => {
        process.exit(0);
      });
    });
    return;
  }

  await closeDatabaseConnections();
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
