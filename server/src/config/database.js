import mongoose from "mongoose";
import { mongodbConnect } from "./mongodbConnect.js";
import { registeredModels } from "../models/index.js";

function normalizeCollectionName(model) {
  return model.collection?.collectionName || model.modelName;
}

function shouldIgnoreCollectionCreationError(error) {
  return error?.code === 48 || error?.codeName === "NamespaceExists";
}

export async function connectToDatabase() {
  return mongodbConnect();
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
