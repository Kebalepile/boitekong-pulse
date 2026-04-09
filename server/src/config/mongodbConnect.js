import mongoose from "mongoose";
import { env } from "./env.js";

let hasLoggedSuccessfulConnection = false;

export async function mongodbConnect() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  mongoose.set("strictQuery", true);

  await mongoose.connect(env.mongodbUri, {
    dbName: env.mongodbDatabaseName,
    serverSelectionTimeoutMS: 10000
  });

  if (!hasLoggedSuccessfulConnection) {
    console.log("MongoDB successfully connected");
    hasLoggedSuccessfulConnection = true;
  }

  return mongoose.connection;
}
