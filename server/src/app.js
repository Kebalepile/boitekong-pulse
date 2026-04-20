import cors from "cors";
import express from "express";
import morgan from "morgan";
import { getAvatarUploadsDirectory } from "./utils/avatarUploads.js";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { applySecurityHeaders, disableApiCaching } from "./middleware/securityHeaders.js";
import apiRoutes from "./routes/index.js";

function normalizeOrigin(origin = "") {
  try {
    const parsed = new URL(origin);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }

    return parsed.origin;
  } catch {
    return "";
  }
}

function createCorsMiddleware() {
  if (env.corsOrigins.length === 0 || env.corsOrigins.includes("*")) {
    return cors({
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      exposedHeaders: ["Retry-After"],
      maxAge: 600
    });
  }

  return cors({
    origin(origin, callback) {
      const normalizedOrigin = normalizeOrigin(origin || "");

      if (!origin || (normalizedOrigin && env.corsOrigins.includes(normalizedOrigin))) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin not allowed."));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Retry-After"],
    maxAge: 600
  });
}

export function createApp() {
  const app = express();

  app.set("trust proxy", env.trustProxy);
  app.use(applySecurityHeaders);
  app.use(createCorsMiddleware());
  app.use(express.json({ limit: env.apiBodyLimit }));
  app.use(
    express.urlencoded({
      extended: true,
      limit: env.apiBodyLimit
    })
  );

  if (env.nodeEnv !== "test") {
    app.use(morgan("dev"));
  }

  app.use("/uploads/avatars", express.static(getAvatarUploadsDirectory()));
  app.use("/api", disableApiCaching);
  app.use("/api", apiRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
