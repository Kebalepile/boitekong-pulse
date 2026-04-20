import dns from "dns";
import mongoose from "mongoose";
import {
  bindRegisteredModels,
  DATABASE_ALIASES,
  getBoundModelDescriptors
} from "../models/index.js";
import { env } from "./env.js";

const loggedConnectionKeys = new Set();
const BASE_MONGO_CONNECT_OPTIONS = {
  family: 4,
  connectTimeoutMS: 60000,
  serverSelectionTimeoutMS: 60000,
  socketTimeoutMS: 60000
};

let activeTopologySignature = "";
let activeTopology = null;
let logicalConnections = new Map();
let physicalConnections = new Map();

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

function getMongoConnectOptions(profile) {
  return {
    ...BASE_MONGO_CONNECT_OPTIONS,
    dbName: profile.databaseName
  };
}

function createConnectionKey(profile) {
  return `${profile.uri}::${profile.databaseName}`;
}

function isPartitionedModeEnabled(options = {}) {
  if (options.partitionedBindings === true) {
    return true;
  }

  if (options.partitionedBindings === false) {
    return false;
  }

  return env.mongodbPartitionMode === "partitioned";
}

function getCoreProfile() {
  return {
    alias: DATABASE_ALIASES.CORE,
    uri: env.mongodbUri,
    uriSafe: env.mongodbUriSafe,
    databaseName: env.mongodbDatabaseName,
    appName: env.mongodbAppName
  };
}

function getContentProfile() {
  if (!env.mongodbUriTwo) {
    return getCoreProfile();
  }

  return {
    alias: DATABASE_ALIASES.CONTENT,
    uri: env.mongodbUriTwo,
    uriSafe: env.mongodbUriTwoSafe,
    databaseName: env.mongodbDatabaseNameTwo,
    appName: env.mongodbAppNameTwo
  };
}

function getMessagingProfile() {
  if (!env.mongodbUriThree) {
    return getCoreProfile();
  }

  return {
    alias: DATABASE_ALIASES.MESSAGING,
    uri: env.mongodbUriThree,
    uriSafe: env.mongodbUriThreeSafe,
    databaseName: env.mongodbDatabaseNameThree,
    appName: env.mongodbAppNameThree
  };
}

function getNotificationsProfile() {
  if (!env.mongodbUriFour) {
    return getContentProfile();
  }

  return {
    alias: DATABASE_ALIASES.NOTIFICATIONS,
    uri: env.mongodbUriFour,
    uriSafe: env.mongodbUriFourSafe,
    databaseName: env.mongodbDatabaseNameFour,
    appName: env.mongodbAppNameFour
  };
}

function resolveLogicalProfiles({
  partitionedBindings = isPartitionedModeEnabled(),
  includeOptionalTargets = partitionedBindings
} = {}) {
  const logicalProfiles = [getCoreProfile()];

  if (partitionedBindings || includeOptionalTargets) {
    logicalProfiles.push({
      ...getContentProfile(),
      alias: DATABASE_ALIASES.CONTENT
    });
    logicalProfiles.push({
      ...getMessagingProfile(),
      alias: DATABASE_ALIASES.MESSAGING
    });
    logicalProfiles.push({
      ...getNotificationsProfile(),
      alias: DATABASE_ALIASES.NOTIFICATIONS
    });
  }

  return {
    partitionedBindings,
    logicalProfiles
  };
}

function createTopologySignature(topology) {
  return JSON.stringify({
    partitionedBindings: topology.partitionedBindings,
    logicalProfiles: topology.logicalProfiles.map((profile) => ({
      alias: profile.alias,
      uriSafe: profile.uriSafe,
      databaseName: profile.databaseName
    }))
  });
}

function areConnectionsReady(topology) {
  return topology.logicalProfiles.every((profile) => {
    const connection = logicalConnections.get(profile.alias);
    return connection?.readyState === 1;
  });
}

function isSrvLookupError(error) {
  const message = error?.message || "";

  return (
    message.includes("querySrv") ||
    message.includes("ENOTFOUND") ||
    message.includes("ECONNREFUSED")
  );
}

function isAtlasConnectionError(error, profile) {
  const message = error?.message || "";

  return (
    profile.uri.includes("mongodb.net") &&
    (error?.name === "MongooseServerSelectionError" ||
      message.includes("ReplicaSetNoPrimary") ||
      message.includes("Could not connect to any servers"))
  );
}

function createMongoConnectionHint(error, profile) {
  const hints = [
    `MongoDB target [${profile.alias}]: ${profile.uriSafe}`,
    `Database name [${profile.alias}]: ${profile.databaseName}`
  ];

  if (isSrvLookupError(error)) {
    hints.push(
      "DNS lookup for the Atlas SRV record failed. Check network access or try the configured DNS fallback servers."
    );
  }

  if (isAtlasConnectionError(error, profile)) {
    hints.push(
      "If this is MongoDB Atlas, add the current machine's IP address to Atlas Network Access or temporarily allow access from anywhere while developing."
    );
  }

  hints.push(
    "Also verify that the cluster is running and that the MongoDB username, password, and database name in .env are correct."
  );

  return hints.join("\n");
}

function attachMongoConnectionHint(error, profile) {
  const hint = createMongoConnectionHint(error, profile);

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

async function buildDirectAtlasUriFromSrvUri(uri, profile) {
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

  if (profile.appName && !searchParams.has("appName")) {
    searchParams.set("appName", profile.appName);
  }

  const databasePath =
    parsed.pathname && parsed.pathname !== "/"
      ? parsed.pathname.replace(/^\//, "")
      : profile.databaseName;
  const username = parsed.username ? encodeURIComponent(decodeURIComponent(parsed.username)) : "";
  const password = parsed.password ? encodeURIComponent(decodeURIComponent(parsed.password)) : "";
  const credentials = username
    ? `${username}${password ? `:${password}` : ""}@`
    : "";

  return `mongodb://${credentials}${hosts}/${databasePath}?${searchParams.toString()}`;
}

async function openConnectionWithUri(uri, profile) {
  const connection = mongoose.createConnection();

  try {
    await connection.openUri(uri, getMongoConnectOptions(profile));
    return connection;
  } catch (error) {
    try {
      await connection.close();
    } catch {
      // Ignore secondary connection close failures after connect errors.
    }

    throw error;
  }
}

async function connectProfile(profile) {
  try {
    return await openConnectionWithUri(profile.uri, profile);
  } catch (error) {
    if (!profile.uri.startsWith("mongodb+srv://") || !isSrvLookupError(error)) {
      throw attachMongoConnectionHint(error, profile);
    }

    console.log(
      `MongoDB SRV lookup failed for ${profile.alias}. Trying Atlas direct-host fallback...`
    );

    try {
      const directUri = await buildDirectAtlasUriFromSrvUri(profile.uri, profile);
      return await openConnectionWithUri(directUri, profile);
    } catch (fallbackError) {
      throw attachMongoConnectionHint(fallbackError, profile);
    }
  }
}

function buildPhysicalProfiles(logicalProfiles) {
  const profilesByKey = new Map();

  logicalProfiles.forEach((profile) => {
    const connectionKey = createConnectionKey(profile);

    if (!profilesByKey.has(connectionKey)) {
      profilesByKey.set(connectionKey, {
        ...profile,
        connectionKey
      });
    }
  });

  return Array.from(profilesByKey.values());
}

async function ensureDatabaseTopology(options = {}) {
  const topology = resolveLogicalProfiles(options);
  const topologySignature = createTopologySignature(topology);

  if (activeTopologySignature === topologySignature && areConnectionsReady(topology)) {
    return activeTopology;
  }

  await closeDatabaseConnections();

  mongoose.set("strictQuery", true);
  applyMongoDnsServers();

  const nextPhysicalConnections = new Map();
  const nextLogicalConnections = new Map();
  const physicalProfiles = buildPhysicalProfiles(topology.logicalProfiles);

  for (const profile of physicalProfiles) {
    const connection = await connectProfile(profile);
    nextPhysicalConnections.set(profile.connectionKey, connection);

    if (!loggedConnectionKeys.has(profile.connectionKey)) {
      console.log(
        `MongoDB connected for ${profile.alias} (${profile.databaseName})`
      );
      loggedConnectionKeys.add(profile.connectionKey);
    }
  }

  topology.logicalProfiles.forEach((profile) => {
    const connectionKey = createConnectionKey(profile);
    const connection = nextPhysicalConnections.get(connectionKey);

    if (!connection) {
      throw new Error(`Missing MongoDB connection for alias ${profile.alias}.`);
    }

    nextLogicalConnections.set(profile.alias, connection);
  });

  bindRegisteredModels(nextLogicalConnections, {
    partitioned: topology.partitionedBindings
  });

  physicalConnections = nextPhysicalConnections;
  logicalConnections = nextLogicalConnections;
  activeTopology = topology;
  activeTopologySignature = topologySignature;

  return topology;
}

export function getDatabaseConnection(alias = DATABASE_ALIASES.CORE) {
  return logicalConnections.get(alias) || null;
}

export function getDatabaseConnections() {
  return new Map(logicalConnections);
}

export async function connectToDatabase(options = {}) {
  await ensureDatabaseTopology(options);
  return getDatabaseConnection(DATABASE_ALIASES.CORE);
}

export async function closeDatabaseConnections() {
  const uniqueConnections = new Set(physicalConnections.values());

  await Promise.all(
    Array.from(uniqueConnections).map(async (connection) => {
      try {
        await connection.close();
      } catch {
        // Ignore connection close failures during shutdown or topology switches.
      }
    })
  );

  physicalConnections = new Map();
  logicalConnections = new Map();
  activeTopology = null;
  activeTopologySignature = "";
}

async function initializeModelsForAlias(alias, models) {
  const connection = getDatabaseConnection(alias);

  if (!connection) {
    throw new Error(`MongoDB connection for alias ${alias} is not available.`);
  }

  const existingCollections = await connection.db
    .listCollections({}, { nameOnly: true })
    .toArray();
  const existingNames = new Set(
    existingCollections.map((collection) => collection.name)
  );
  const createdCollections = [];

  for (const model of models) {
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

  await Promise.all(models.map((model) => model.syncIndexes()));

  return {
    alias,
    databaseName: connection.name,
    createdCollections,
    collections: models.map((model) => normalizeCollectionName(model))
  };
}

export async function initializeDatabaseStructure(options = {}) {
  const topology = await ensureDatabaseTopology(options);
  const modelsByAlias = new Map();

  getBoundModelDescriptors().forEach((descriptor) => {
    if (!modelsByAlias.has(descriptor.activeAlias)) {
      modelsByAlias.set(descriptor.activeAlias, []);
    }

    modelsByAlias.get(descriptor.activeAlias).push(descriptor.model);
  });

  const databases = [];

  for (const [alias, models] of modelsByAlias.entries()) {
    databases.push(await initializeModelsForAlias(alias, models));
  }

  return {
    partitioned: topology.partitionedBindings,
    databaseName: databases[0]?.databaseName || "",
    createdCollections: databases.flatMap((entry) => entry.createdCollections),
    collections: databases.flatMap((entry) => entry.collections),
    databases
  };
}
