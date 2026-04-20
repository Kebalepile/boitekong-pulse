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
const MIGRATION_PLAN = [
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

async function copyCollection({ label, sourceCollection, targetCollection }) {
  const sourceCount = await sourceCollection.countDocuments({});

  if (sourceCount === 0) {
    return {
      label,
      sourceCount,
      copied: 0,
      skipped: true
    };
  }

  const cursor = sourceCollection.find({});
  let copied = 0;
  let batch = [];

  try {
    while (await cursor.hasNext()) {
      batch.push(await cursor.next());

      if (batch.length >= BATCH_SIZE) {
        await writeBatch(targetCollection, batch);
        copied += batch.length;
        batch = [];
      }
    }

    if (batch.length > 0) {
      await writeBatch(targetCollection, batch);
      copied += batch.length;
    }
  } finally {
    await cursor.close().catch(() => {});
  }

  return {
    label,
    sourceCount,
    copied,
    skipped: false
  };
}

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
    `Partitioned MongoDB wiring ready across ${databaseSummary.databases.length} logical stores.`
  );

  const sourceConnection = getDatabaseConnection(DATABASE_ALIASES.CORE);
  const summaries = [];

  for (const entry of MIGRATION_PLAN) {
    const targetConnection = getDatabaseConnection(entry.alias);
    const collectionName = entry.model.collection.collectionName;

    if (!sourceConnection || !targetConnection) {
      throw new Error(`Missing MongoDB connection while migrating ${entry.label}.`);
    }

    if (sourceConnection === targetConnection) {
      summaries.push({
        label: entry.label,
        sourceCount: await sourceConnection.collection(collectionName).countDocuments({}),
        copied: 0,
        skipped: true
      });
      console.log(`[${entry.label}] source and target are the same database, skipping copy.`);
      continue;
    }

    const summary = await copyCollection({
      label: entry.label,
      sourceCollection: sourceConnection.collection(collectionName),
      targetCollection: targetConnection.collection(collectionName)
    });

    summaries.push(summary);
    console.log(
      `[${entry.label}] source=${summary.sourceCount} copied=${summary.copied} skipped=${summary.skipped}`
    );
  }

  const totalCopied = summaries.reduce((count, entry) => count + entry.copied, 0);
  console.log(`Partitioned copy complete. Upserted ${totalCopied} documents.`);
  console.log(
    "Source collections were left untouched. After you verify the partitioned app reads correctly, we can add a cleanup pass to reclaim space from the original cluster."
  );
}

run().catch(async (error) => {
  console.error("Partitioned MongoDB migration failed.");
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await closeDatabaseConnections().catch(() => {});
});
