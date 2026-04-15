import cors from "cors";
import express from "express";
import morgan from "morgan";
import { getAvatarUploadsDirectory } from "./utils/avatarUploads.js";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import apiRoutes from "./routes/index.js";

function createCorsMiddleware() {
  if (env.corsOrigins.length === 0 || env.corsOrigins.includes("*")) {
    return cors();
  }

  return cors({
    origin(origin, callback) {
      if (!origin || env.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin not allowed."));
    }
  });
}

export function createApp() {
  const app = express();

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
  app.use("/api", apiRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
