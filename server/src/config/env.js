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

function parseOriginList(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
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

function validateRuntimeEnv(config) {
  if (config.nodeEnv !== "production") {
    return config;
  }

  if (!config.jwtSecret || config.jwtSecret === "change-this-before-production") {
    throw new Error(
      "JWT_SECRET must be set to a strong non-default value before starting the API in production."
    );
  }

  return config;
}

const port = Number.parseInt(readEnv("PORT", "4000"), 10);
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
  nodeEnv: readEnv("NODE_ENV", "development"),
  port: Number.isNaN(port) ? 4000 : port,
  apiBodyLimit: readEnv("API_BODY_LIMIT", "8mb"),
  mongodbUri,
  mongodbUriSafe: sanitizeMongoUri(mongodbUri),
  mongodbDatabaseName,
  mongodbUsername,
  mongodbPassword,
  mongodbClusterHost,
  mongodbAppName,
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
  corsOrigins: parseOriginList(readEnv("CORS_ORIGIN", ""))
});
