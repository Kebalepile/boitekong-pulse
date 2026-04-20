import {
  closeDatabaseConnections,
  connectToDatabase,
  initializeDatabaseStructure
} from "../config/database.js";
import { Comment } from "../models/Comment.js";
import { Message } from "../models/Message.js";
import { Post } from "../models/Post.js";

const LEGACY_INLINE_VOICE_NOTE_FILTER = {
  "voiceNote.dataUrl": {
    $regex: /^data:audio\//i
  }
};

const PLAYABLE_VOICE_NOTE_FILTER = {
  $or: [
    { "voiceNote.audioData": { $exists: true, $ne: null } },
    { "voiceNote.url": { $exists: true, $ne: "" } },
    { "voiceNote.storageKey": { $exists: true, $ne: "" } }
  ]
};

function buildLegacyOnlyFilter() {
  return {
    $and: [
      LEGACY_INLINE_VOICE_NOTE_FILTER,
      {
        $nor: [PLAYABLE_VOICE_NOTE_FILTER]
      }
    ]
  };
}

function buildLegacyShadowFilter() {
  return {
    $and: [LEGACY_INLINE_VOICE_NOTE_FILTER, PLAYABLE_VOICE_NOTE_FILTER]
  };
}

async function purgeLegacyVoiceNotesForModel(Model, label) {
  const collection = Model.collection;
  const legacyOnlyFilter = buildLegacyOnlyFilter();
  const legacyShadowFilter = buildLegacyShadowFilter();
  const [legacyOnlyCount, legacyShadowCount] = await Promise.all([
    collection.countDocuments(legacyOnlyFilter),
    collection.countDocuments(legacyShadowFilter)
  ]);
  const [removedLegacyOnlyResult, strippedLegacyShadowResult] = await Promise.all([
    collection.updateMany(legacyOnlyFilter, {
      $unset: {
        voiceNote: ""
      }
    }),
    collection.updateMany(legacyShadowFilter, {
      $unset: {
        "voiceNote.dataUrl": ""
      }
    })
  ]);

  return {
    label,
    legacyOnlyCount,
    legacyShadowCount,
    voiceNotesRemoved: removedLegacyOnlyResult.modifiedCount || 0,
    staleDataUrlsRemoved: strippedLegacyShadowResult.modifiedCount || 0
  };
}

async function run() {
  await connectToDatabase();
  const databaseSummary = await initializeDatabaseStructure();
  console.log(
    `Connected to MongoDB database ${databaseSummary.databaseName}. Purging legacy inline voice notes...`
  );

  const summaries = [];

  for (const [Model, label] of [
    [Post, "posts"],
    [Comment, "comments"],
    [Message, "messages"]
  ]) {
    const summary = await purgeLegacyVoiceNotesForModel(Model, label);
    summaries.push(summary);
    console.log(
      `[${label}] legacyOnly=${summary.legacyOnlyCount} removed=${summary.voiceNotesRemoved} shadowDataUrls=${summary.legacyShadowCount} stripped=${summary.staleDataUrlsRemoved}`
    );
  }

  const totalRemoved = summaries.reduce(
    (count, summary) => count + summary.voiceNotesRemoved + summary.staleDataUrlsRemoved,
    0
  );

  console.log(`Legacy voice-note purge complete. Updated ${totalRemoved} documents.`);
  await closeDatabaseConnections();
}

run().catch((error) => {
  console.error("Legacy voice-note purge failed.");
  console.error(error);
  process.exit(1);
});
