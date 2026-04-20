import {
  closeDatabaseConnections,
  connectToDatabase,
  getDatabaseConnection,
  initializeDatabaseStructure
} from "../config/database.js";
import { DATABASE_ALIASES } from "../models/index.js";
import { Comment } from "../models/Comment.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { Notification } from "../models/Notification.js";
import { Post } from "../models/Post.js";

const BATCH_SIZE = 200;
const CLEANUP_PLAN = [
  {
    alias: DATABASE_ALIASES.CONTENT,
    label: "posts",
    model: Post
  },
  {
    alias: DATABASE_ALIASES.CONTENT,
    label: "comments",
    model: Comment
  },
  {
    alias: DATABASE_ALIASES.NOTIFICATIONS,
    label: "notifications",
    model: Notification
  },
  {
    alias: DATABASE_ALIASES.MESSAGING,
    label: "conversations",
    model: Conversation
  },
  {
    alias: DATABASE_ALIASES.MESSAGING,
    label: "messages",
    model: Message
  }
];

async function writeBatch(targetCollection, documents) {
  if (!Array.isArray(documents) || documents.length === 0) {
    return;
  }

  await targetCollection.bulkWrite(
    documents.map((document) => ({
      replaceOne: {
        filter: { _id: document._id },
        replacement: document,
        upsert: true
      }
    })),
    {
      ordered: false
    }
  );
}

async function syncCollection({ sourceCollection, targetCollection }) {
  const sourceCount = await sourceCollection.countDocuments({});

  if (sourceCount === 0) {
    return {
      sourceCount,
      syncedCount: 0
    };
  }

  const cursor = sourceCollection.find({});
  let syncedCount = 0;
  let batch = [];

  try {
    while (await cursor.hasNext()) {
      batch.push(await cursor.next());

      if (batch.length >= BATCH_SIZE) {
        await writeBatch(targetCollection, batch);
        syncedCount += batch.length;
        batch = [];
      }
    }

    if (batch.length > 0) {
      await writeBatch(targetCollection, batch);
      syncedCount += batch.length;
    }
  } finally {
    await cursor.close().catch(() => {});
  }

  return {
    sourceCount,
    syncedCount
  };
}

async function verifyBatchIds(targetCollection, ids) {
  const targetIds = new Set(
    (
      await targetCollection
        .find(
          {
            _id: { $in: ids }
          },
          {
            projection: { _id: 1 }
          }
        )
        .toArray()
    ).map((document) => String(document._id))
  );

  return ids
    .filter((id) => !targetIds.has(String(id)))
    .map((id) => String(id));
}

async function verifySourceMirrored({ sourceCollection, targetCollection }) {
  const sourceCount = await sourceCollection.countDocuments({});

  if (sourceCount === 0) {
    return {
      sourceCount,
      verifiedCount: 0,
      missingIds: []
    };
  }

  const cursor = sourceCollection.find(
    {},
    {
      projection: { _id: 1 }
    }
  );
  const missingIds = [];
  let verifiedCount = 0;
  let batch = [];

  try {
    while (await cursor.hasNext()) {
      const document = await cursor.next();
      batch.push(document._id);

      if (batch.length >= BATCH_SIZE) {
        const missingBatchIds = await verifyBatchIds(targetCollection, batch);
        verifiedCount += batch.length - missingBatchIds.length;

        if (missingBatchIds.length > 0) {
          missingIds.push(...missingBatchIds);
          break;
        }

        batch = [];
      }
    }

    if (missingIds.length === 0 && batch.length > 0) {
      const missingBatchIds = await verifyBatchIds(targetCollection, batch);
      verifiedCount += batch.length - missingBatchIds.length;
      missingIds.push(...missingBatchIds);
    }
  } finally {
    await cursor.close().catch(() => {});
  }

  return {
    sourceCount,
    verifiedCount,
    missingIds
  };
}

async function collectionExists(connection, collectionName) {
  const collections = await connection.db
    .listCollections({ name: collectionName }, { nameOnly: true })
    .toArray();

  return collections.length > 0;
}

async function dropCollectionIfPresent(connection, collectionName) {
  if (!(await collectionExists(connection, collectionName))) {
    return false;
  }

  await connection.dropCollection(collectionName);
  return true;
}

async function run() {
  await connectToDatabase({
    partitionedBindings: true,
    includeOptionalTargets: true
  });
  const databaseSummary = await initializeDatabaseStructure({
    partitionedBindings: true,
    includeOptionalTargets: true
  });

  console.log(
    `Partitioned MongoDB cleanup preflight ready across ${databaseSummary.databases.length} logical stores.`
  );

  const sourceConnection = getDatabaseConnection(DATABASE_ALIASES.CORE);
  const verificationSummaries = [];

  for (const entry of CLEANUP_PLAN) {
    const targetConnection = getDatabaseConnection(entry.alias);
    const collectionName = entry.model.collection.collectionName;

    if (!sourceConnection || !targetConnection) {
      throw new Error(`Missing MongoDB connection while cleaning up ${entry.label}.`);
    }

    if (sourceConnection === targetConnection) {
      verificationSummaries.push({
        label: entry.label,
        collectionName,
        sourceCount: await sourceConnection.collection(collectionName).countDocuments({}),
        syncedCount: 0,
        verifiedCount: 0,
        missingIds: [],
        skipped: true
      });
      console.log(`[${entry.label}] source and target are the same database, skipping cleanup.`);
      continue;
    }

    const sourceCollection = sourceConnection.collection(collectionName);
    const targetCollection = targetConnection.collection(collectionName);
    const syncSummary = await syncCollection({
      sourceCollection,
      targetCollection
    });
    const verificationSummary = await verifySourceMirrored({
      sourceCollection,
      targetCollection
    });
    const summary = {
      label: entry.label,
      collectionName,
      sourceCount: syncSummary.sourceCount,
      syncedCount: syncSummary.syncedCount,
      verifiedCount: verificationSummary.verifiedCount,
      missingIds: verificationSummary.missingIds,
      skipped: false
    };

    verificationSummaries.push(summary);

    if (summary.missingIds.length > 0) {
      console.log(
        `[${entry.label}] verification failed. missing=${summary.missingIds.length} exampleIds=${summary.missingIds.slice(0, 5).join(", ")}`
      );
      continue;
    }

    console.log(
      `[${entry.label}] source=${summary.sourceCount} synced=${summary.syncedCount} verified=${summary.verifiedCount}`
    );
  }

  const failedSummaries = verificationSummaries.filter(
    (summary) => !summary.skipped && summary.missingIds.length > 0
  );

  if (failedSummaries.length > 0) {
    console.error("Partitioned MongoDB cleanup aborted. No source collections were dropped.");
    process.exitCode = 1;
    return;
  }

  let droppedCollections = 0;

  for (const summary of verificationSummaries) {
    if (summary.skipped) {
      continue;
    }

    if (!(await dropCollectionIfPresent(sourceConnection, summary.collectionName))) {
      console.log(`[${summary.label}] source collection already absent.`);
      continue;
    }

    droppedCollections += 1;
    console.log(
      `[${summary.label}] dropped source collection "${summary.collectionName}" from the core database.`
    );
  }

  console.log(
    `Partitioned cleanup complete. Dropped ${droppedCollections} source collections from the core database.`
  );
}

run().catch(async (error) => {
  console.error("Partitioned MongoDB cleanup failed.");
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await closeDatabaseConnections().catch(() => {});
});
