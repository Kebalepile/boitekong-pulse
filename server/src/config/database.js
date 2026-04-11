import dns from "dns";
import mongoose from "mongoose";
import { env } from "./env.js";
import { registeredModels } from "../models/index.js";

let hasLoggedSuccessfulConnection = false;

const mongoConnectOptions = {
  dbName: env.mongodbDatabaseName,
  family: 4,
  connectTimeoutMS: 60000,
  serverSelectionTimeoutMS: 60000,
  socketTimeoutMS: 60000
};

function normalizeCollectionName(model) {
  return model.collection?.collectionName || model.modelName;
}

function shouldIgnoreCollectionCreationError(error) {
  return error?.code === 48 || error?.codeName === "NamespaceExists";
}

function applyMongoDnsServers() {
  if (!Array.isArray(env.mongodbDnsServers) || env.mongodbDnsServers.length === 0) {
    return;
  }

  try {
    dns.setServers(env.mongodbDnsServers);
  } catch {
    // Ignore invalid DNS server overrides and continue with system defaults.
  }
}

async function connectWithUri(uri) {
  await mongoose.connect(uri, mongoConnectOptions);
}

function isSrvLookupError(error) {
  const message = error?.message || "";

  return (
    message.includes("querySrv") ||
    message.includes("ENOTFOUND") ||
    message.includes("ECONNREFUSED")
  );
}

function isAtlasConnectionError(error) {
  const message = error?.message || "";

  return (
    env.mongodbUri.includes("mongodb.net") &&
    (error?.name === "MongooseServerSelectionError" ||
      message.includes("ReplicaSetNoPrimary") ||
      message.includes("Could not connect to any servers"))
  );
}

function createMongoConnectionHint(error) {
  const hints = [`MongoDB target: ${env.mongodbUriSafe}`];

  if (isSrvLookupError(error)) {
    hints.push(
      "DNS lookup for the Atlas SRV record failed. Check network access or try the configured DNS fallback servers."
    );
  }

  if (isAtlasConnectionError(error)) {
    hints.push(
      "If this is MongoDB Atlas, add the current machine's IP address to Atlas Network Access or temporarily allow access from anywhere while developing."
    );
  }

  hints.push(
    "Also verify that the cluster is running and that the MongoDB username, password, and database name in .env are correct."
  );

  return hints.join("\n");
}

function attachMongoConnectionHint(error) {
  const hint = createMongoConnectionHint(error);

  if (!hint || typeof error?.message !== "string" || error.message.includes(hint)) {
    return error;
  }

  error.message = `${error.message}\n${hint}`;
  return error;
}

function parseTxtData(data = "") {
  return String(data)
    .replace(/^"|"$/g, "")
    .split("&")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function fetchDnsJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`DNS over HTTPS request failed with status ${response.status}`);
  }

  return response.json();
}

async function buildDirectAtlasUriFromSrvUri(uri) {
  const parsed = new URL(uri);
  const clusterHost = parsed.hostname;
  const srvName = `_mongodb._tcp.${clusterHost}`;
  const [srvResponse, txtResponse] = await Promise.all([
    fetchDnsJson(`https://dns.google/resolve?name=${encodeURIComponent(srvName)}&type=SRV`),
    fetchDnsJson(`https://dns.google/resolve?name=${encodeURIComponent(clusterHost)}&type=TXT`)
  ]);
  const srvAnswers = Array.isArray(srvResponse.Answer) ? srvResponse.Answer : [];

  if (srvAnswers.length === 0) {
    throw new Error("Atlas DNS fallback could not find SRV answers.");
  }

  const hosts = srvAnswers
    .map((answer) => String(answer.data || "").trim())
    .map((entry) => {
      const parts = entry.split(/\s+/);
      const port = parts[2];
      const host = (parts[3] || "").replace(/\.$/, "");
      return host && port ? `${host}:${port}` : "";
    })
    .filter(Boolean)
    .join(",");

  const searchParams = new URLSearchParams(parsed.search);
  const txtAnswers = Array.isArray(txtResponse.Answer) ? txtResponse.Answer : [];

  txtAnswers.forEach((answer) => {
    parseTxtData(answer.data).forEach((pair) => {
      const [key, value = ""] = pair.split("=");

      if (key && !searchParams.has(key)) {
        searchParams.set(key, value);
      }
    });
  });

  if (!searchParams.has("tls") && !searchParams.has("ssl")) {
    searchParams.set("tls", "true");
  }

  if (!searchParams.has("retryWrites")) {
    searchParams.set("retryWrites", "true");
  }

  if (!searchParams.has("w")) {
    searchParams.set("w", "majority");
  }

  if (env.mongodbAppName && !searchParams.has("appName")) {
    searchParams.set("appName", env.mongodbAppName);
  }

  const databasePath = parsed.pathname && parsed.pathname !== "/"
    ? parsed.pathname.replace(/^\//, "")
    : env.mongodbDatabaseName;
  const username = parsed.username ? encodeURIComponent(decodeURIComponent(parsed.username)) : "";
  const password = parsed.password ? encodeURIComponent(decodeURIComponent(parsed.password)) : "";
  const credentials = username
    ? `${username}${password ? `:${password}` : ""}@`
    : "";

  return `mongodb://${credentials}${hosts}/${databasePath}?${searchParams.toString()}`;
}

export async function connectToDatabase() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  mongoose.set("strictQuery", true);
  applyMongoDnsServers();

  try {
    await connectWithUri(env.mongodbUri);
  } catch (error) {
    if (!env.mongodbUri.startsWith("mongodb+srv://") || !isSrvLookupError(error)) {
      throw attachMongoConnectionHint(error);
    }

    console.log("MongoDB SRV lookup failed. Trying Atlas direct-host fallback...");

    try {
      const directUri = await buildDirectAtlasUriFromSrvUri(env.mongodbUri);
      await connectWithUri(directUri);
    } catch (fallbackError) {
      throw attachMongoConnectionHint(fallbackError);
    }
  }

  if (!hasLoggedSuccessfulConnection) {
    console.log("MongoDB successfully connected");
    hasLoggedSuccessfulConnection = true;
  }

  return mongoose.connection;
}

export async function initializeDatabaseStructure() {
  const existingCollections = await mongoose.connection.db
    .listCollections({}, { nameOnly: true })
    .toArray();
  const existingNames = new Set(
    existingCollections.map((collection) => collection.name)
  );
  const createdCollections = [];

  for (const model of registeredModels) {
    const collectionName = normalizeCollectionName(model);

    if (existingNames.has(collectionName)) {
      continue;
    }

    try {
      await model.createCollection();
      createdCollections.push(collectionName);
    } catch (error) {
      if (!shouldIgnoreCollectionCreationError(error)) {
        throw error;
      }
    }
  }

  await Promise.all(registeredModels.map((model) => model.syncIndexes()));

  return {
    databaseName: mongoose.connection.name,
    createdCollections,
    collections: registeredModels.map((model) => normalizeCollectionName(model))
  };
}
