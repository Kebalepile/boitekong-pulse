import dotenv from "dotenv";

dotenv.config();

function readEnvFromNames(names, fallback = "") {
  for (const name of names) {
    const value = process.env[name];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

function readEnv(name, fallback = "") {
  return readEnvFromNames([name], fallback);
}

function normalizeOrigin(value) {
  try {
    const parsed = new URL(value);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return value;
    }

    return parsed.origin;
  } catch {
    return value;
  }
}

function parseOriginList(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => normalizeOrigin(entry));
}

function parseCsvList(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readNumberEnv(name, fallback) {
  const value = Number.parseInt(readEnv(name, String(fallback)), 10);
  return Number.isNaN(value) ? fallback : value;
}

function readTrustProxyEnv(name, fallback = "0") {
  const value = readEnv(name, fallback);
  const normalizedValue = value.trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalizedValue)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalizedValue)) {
    return false;
  }

  const numericValue = Number.parseInt(value, 10);

  if (!Number.isNaN(numericValue) && String(numericValue) === value.trim()) {
    return numericValue;
  }

  return value;
}

function readMongoPartitionMode(name, fallback = "single") {
  const normalizedValue = readEnv(name, fallback).trim().toLowerCase();

  if (["partitioned", "multi", "split"].includes(normalizedValue)) {
    return "partitioned";
  }

  return "single";
}

function readTimeZoneEnv(name, fallback) {
  const value = readEnv(name, fallback);

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return fallback;
  }
}

function isLocalMongoHost(hostname = "") {
  return ["127.0.0.1", "localhost", "::1"].includes(hostname);
}

function isLocalMongoUri(uri = "") {
  return ["127.0.0.1", "localhost", "::1"].some((entry) => uri.includes(entry));
}

function buildMongoUri({
  explicitUri,
  username,
  password,
  clusterHost,
  databaseName,
  appName
}) {
  const safeExplicitUri = typeof explicitUri === "string" ? explicitUri.trim() : "";

  if (safeExplicitUri && !isLocalMongoUri(safeExplicitUri)) {
    try {
      const parsed = new URL(safeExplicitUri);

      if (!parsed.pathname || parsed.pathname === "/") {
        parsed.pathname = `/${databaseName || "boitekong-pulse"}`;
      }

      if (username && password && !parsed.username && !parsed.password) {
        parsed.username = username;
        parsed.password = password;
      }

      if (appName && !parsed.searchParams.has("appName")) {
        parsed.searchParams.set("appName", appName);
      }

      return parsed.toString();
    } catch {
      return safeExplicitUri;
    }
  }

  if (clusterHost && username && password) {
    const databasePath = databaseName || "boitekong-pulse";
    return `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${clusterHost}/${databasePath}?retryWrites=true&w=majority&appName=${encodeURIComponent(appName || "BoitekongPulse")}`;
  }

  try {
    const parsed = new URL(explicitUri);

    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = `/${databaseName}`;
    }

    if (username && password && !parsed.username && !parsed.password && !isLocalMongoHost(parsed.hostname)) {
      parsed.username = username;
      parsed.password = password;
    }

    return parsed.toString();
  } catch {
    return explicitUri;
  }
}

function sanitizeMongoUri(uri) {
  try {
    const parsed = new URL(uri);

    if (parsed.password) {
      parsed.password = "***";
    }

    return parsed.toString();
  } catch {
    return uri;
  }
}

function buildAdditionalMongoUri({
  explicitUriNames,
  databaseNameNames,
  appNameNames,
  fallbackDatabaseName,
  fallbackAppName
}) {
  const explicitUri = readEnvFromNames(explicitUriNames, "");
  const databaseName = readEnvFromNames(databaseNameNames, fallbackDatabaseName);
  const appName = readEnvFromNames(appNameNames, fallbackAppName);

  if (!explicitUri) {
    return {
      uri: "",
      uriSafe: "",
      databaseName,
      appName
    };
  }

  const uri = buildMongoUri({
    explicitUri,
    username: "",
    password: "",
    clusterHost: "",
    databaseName,
    appName
  });

  return {
    uri,
    uriSafe: sanitizeMongoUri(uri),
    databaseName,
    appName
  };
}

function isHttpOrigin(value) {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.origin === value;
  } catch {
    return false;
  }
}

function validateRuntimeEnv(config) {
  if (config.headersTimeoutMs <= config.keepAliveTimeoutMs) {
    throw new Error(
      "SERVER_HEADERS_TIMEOUT_MS must be greater than SERVER_KEEP_ALIVE_TIMEOUT_MS."
    );
  }

  if (config.nodeEnv !== "production") {
    return config;
  }

  if (!config.jwtSecret || config.jwtSecret === "change-this-before-production") {
    throw new Error(
      "JWT_SECRET must be set to a strong non-default value before starting the API in production."
    );
  }

  if (config.corsOrigins.length === 0 || config.corsOrigins.includes("*")) {
    throw new Error(
      "CORS_ORIGIN must be set to the deployed frontend origin(s) in production. Blank or wildcard values are not allowed."
    );
  }

  if (!config.corsOrigins.every((origin) => isHttpOrigin(origin))) {
    throw new Error(
      "CORS_ORIGIN must contain only valid http(s) origins, for example https://yourapp.vercel.app."
    );
  }

  return config;
}

const port = Number.parseInt(readEnv("PORT", "4000"), 10);
const nodeEnv = readEnv("NODE_ENV", "development");
const mongodbDatabaseName = readEnvFromNames(
  ["MONGODB_DATABASE_NAME", "MONGODB_DB_NAME"],
  "boitekong-pulse"
);
const mongodbUsername = readEnvFromNames(
  ["MONGODB_USERNAME", "MONGDB_USERNAME"],
  ""
);
const mongodbPassword = readEnvFromNames(
  ["MONGODB_PASSWORD", "MONGODB_PASSWRD", "MONGDB_PASSWORD", "MONGDB_PASSWRD"],
  ""
);
const mongodbClusterHost = readEnvFromNames(
  ["MONGODB_CLUSTER_HOST", "MONGODB_ATLAS_HOST", "MONGODB_HOST"],
  ""
);
const mongodbAppName = readEnvFromNames(
  ["MONGODB_APP_NAME", "MONGODB_ATLAS_APP_NAME"],
  "BoitekongPulse"
);
const mongodbDnsServers = parseCsvList(
  readEnv("MONGODB_DNS_SERVERS", "8.8.8.8,1.1.1.1")
);
const mongodbUri = buildMongoUri({
  explicitUri: readEnv("MONGODB_URI", `mongodb://127.0.0.1:27017/${mongodbDatabaseName}`),
  username: mongodbUsername,
  password: mongodbPassword,
  clusterHost: mongodbClusterHost,
  databaseName: mongodbDatabaseName,
  appName: mongodbAppName
});
const {
  uri: mongodbUriTwo,
  uriSafe: mongodbUriTwoSafe,
  databaseName: mongodbDatabaseNameTwo,
  appName: mongodbAppNameTwo
} = buildAdditionalMongoUri({
  explicitUriNames: ["MONGODB_URI_TWO", "MONGODB_URI_2"],
  databaseNameNames: ["MONGODB_DATABASE_NAME_TWO", "MONGODB_DB_NAME_TWO"],
  appNameNames: ["MONGODB_APP_NAME_TWO", "MONGODB_ATLAS_APP_NAME_TWO"],
  fallbackDatabaseName: mongodbDatabaseName,
  fallbackAppName: mongodbAppName
});
const {
  uri: mongodbUriThree,
  uriSafe: mongodbUriThreeSafe,
  databaseName: mongodbDatabaseNameThree,
  appName: mongodbAppNameThree
} = buildAdditionalMongoUri({
  explicitUriNames: ["MONGODB_URI_THREE", "MONGODB_URI_3"],
  databaseNameNames: ["MONGODB_DATABASE_NAME_THREE", "MONGODB_DB_NAME_THREE"],
  appNameNames: ["MONGODB_APP_NAME_THREE", "MONGODB_ATLAS_APP_NAME_THREE"],
  fallbackDatabaseName: mongodbDatabaseName,
  fallbackAppName: mongodbAppName
});
const {
  uri: mongodbUriFour,
  uriSafe: mongodbUriFourSafe,
  databaseName: mongodbDatabaseNameFour,
  appName: mongodbAppNameFour
} = buildAdditionalMongoUri({
  explicitUriNames: ["MONGODB_URI_FOUR", "MONGODB_URI_4"],
  databaseNameNames: ["MONGODB_DATABASE_NAME_FOUR", "MONGODB_DB_NAME_FOUR"],
  appNameNames: ["MONGODB_APP_NAME_FOUR", "MONGODB_ATLAS_APP_NAME_FOUR"],
  fallbackDatabaseName: mongodbDatabaseName,
  fallbackAppName: mongodbAppName
});
const smsApiKey = readEnvFromNames(["SMS_APIKEY", "SMS_API_KEY"], "");
const smsBaseUrl = readEnv("SMS_BASE_URL", "https://platform.clickatell.com/messages/http/send");
const otpCodeLength = readNumberEnv("OTP_CODE_LENGTH", 6);
const otpExpiresInMinutes = readNumberEnv("OTP_EXPIRES_IN_MINUTES", 10);
const otpResendCooldownSeconds = readNumberEnv("OTP_RESEND_COOLDOWN_SECONDS", 60);
const otpMaxAttempts = readNumberEnv("OTP_MAX_ATTEMPTS", 5);
const voiceNotesPerDayLimit = Math.max(0, readNumberEnv("VOICE_NOTES_PER_DAY_LIMIT", 5));
const voiceNoteDailyLimitTimezone = readTimeZoneEnv(
  "VOICE_NOTE_DAILY_LIMIT_TIMEZONE",
  "Africa/Johannesburg"
);

export const env = validateRuntimeEnv({
  nodeEnv,
  port: Number.isNaN(port) ? 4000 : port,
  apiBodyLimit: readEnv("API_BODY_LIMIT", "8mb"),
  mongodbPartitionMode: readMongoPartitionMode("MONGODB_PARTITION_MODE", "single"),
  trustProxy: readTrustProxyEnv("TRUST_PROXY", nodeEnv === "production" ? "1" : "0"),
  requestTimeoutMs: Math.max(1000, readNumberEnv("SERVER_REQUEST_TIMEOUT_MS", 30000)),
  headersTimeoutMs: Math.max(1000, readNumberEnv("SERVER_HEADERS_TIMEOUT_MS", 35000)),
  keepAliveTimeoutMs: Math.max(1000, readNumberEnv("SERVER_KEEP_ALIVE_TIMEOUT_MS", 5000)),
  mongodbUri,
  mongodbUriSafe: sanitizeMongoUri(mongodbUri),
  mongodbDatabaseName,
  mongodbUsername,
  mongodbPassword,
  mongodbClusterHost,
  mongodbAppName,
  mongodbUriTwo,
  mongodbUriTwoSafe,
  mongodbDatabaseNameTwo,
  mongodbAppNameTwo,
  mongodbUriThree,
  mongodbUriThreeSafe,
  mongodbDatabaseNameThree,
  mongodbAppNameThree,
  mongodbUriFour,
  mongodbUriFourSafe,
  mongodbDatabaseNameFour,
  mongodbAppNameFour,
  mongodbDnsServers,
  smsApiKey,
  smsBaseUrl,
  otpCodeLength,
  otpExpiresInMinutes,
  otpResendCooldownSeconds,
  otpMaxAttempts,
  voiceNotesPerDayLimit,
  voiceNoteDailyLimitTimezone,
  jwtSecret: readEnv("JWT_SECRET", "change-this-before-production"),
  jwtExpiresIn: readEnv("JWT_EXPIRES_IN", "7d"),
  corsOrigins: parseOriginList(readEnvFromNames(["CORS_ORIGIN", "FRONTEND_ORIGIN", "APP_ORIGIN"], ""))
});
