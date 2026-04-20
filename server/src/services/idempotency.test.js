import assert from "node:assert/strict";
import mongoose from "mongoose";
import { sendMessage } from "./conversationService.js";
import { createPost } from "./postService.js";
import { Comment } from "../models/Comment.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { Notification } from "../models/Notification.js";
import { Post } from "../models/Post.js";
import { User } from "../models/User.js";
import { MAX_VOICE_NOTE_AUDIO_BYTES } from "../utils/validators.js";

function createQuery(initialValue) {
  let currentValue = Array.isArray(initialValue) ? [...initialValue] : initialValue;
  const query = {
    sort(sortSpec = {}) {
      if (Array.isArray(currentValue)) {
        const [field, direction] = Object.entries(sortSpec)[0] || [];

        if (field) {
          currentValue = [...currentValue].sort((left, right) => {
            const leftValue = new Date(left?.[field] || 0).getTime();
            const rightValue = new Date(right?.[field] || 0).getTime();
            return direction >= 0 ? leftValue - rightValue : rightValue - leftValue;
          });
        }
      }

      return query;
    },
    limit(limitValue) {
      if (Array.isArray(currentValue) && Number.isInteger(limitValue)) {
        currentValue = currentValue.slice(0, limitValue);
      }

      return query;
    },
    select() {
      return query;
    },
    lean() {
      return query;
    },
    then(resolve, reject) {
      return Promise.resolve(currentValue).then(resolve, reject);
    },
    catch(reject) {
      return Promise.resolve(currentValue).catch(reject);
    },
    finally(onFinally) {
      return Promise.resolve(currentValue).finally(onFinally);
    }
  };

  return query;
}

async function withPatchedMethods(patches, run) {
  const originals = patches.map(({ target, methodName }) => ({
    target,
    methodName,
    originalMethod: target[methodName]
  }));

  patches.forEach(({ target, methodName, implementation }) => {
    target[methodName] = implementation;
  });

  try {
    return await run();
  } finally {
    originals.forEach(({ target, methodName, originalMethod }) => {
      target[methodName] = originalMethod;
    });
  }
}

function createUserRecord({
  id = new mongoose.Types.ObjectId().toString(),
  username = "user",
  township = "Boitekong",
  extension = "1"
} = {}) {
  const now = new Date();

  return {
    _id: id,
    username,
    usernameLower: username.toLowerCase(),
    phoneNumber: `+27${String(id).slice(-9)}`,
    avatarUrl: "",
    location: {
      township,
      extension
    },
    directMessagesEnabled: true,
    notificationsEnabled: true,
    blockedUserIds: [],
    followingUserIds: [],
    phoneVerified: true,
    roles: ["user"],
    createdAt: now,
    updatedAt: now
  };
}

function createConversationRecord({
  id = new mongoose.Types.ObjectId().toString(),
  participantIds
}) {
  const now = new Date();
  const conversation = {
    _id: id,
    participantIds,
    archivedByUserIds: [],
    lastMessageId: null,
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
    async save() {
      this.updatedAt = new Date();
      return this;
    }
  };

  return conversation;
}

function createMessageRecord({
  id = new mongoose.Types.ObjectId().toString(),
  conversationId,
  senderId,
  replyToMessageId = null,
  text = "",
  encryptedText = "",
  encryption = null,
  voiceNote = null,
  clientRequestId = null,
  createdAt = new Date()
}) {
  return {
    _id: id,
    conversationId,
    senderId,
    replyToMessageId,
    text,
    encryptedText,
    encryption,
    voiceNote,
    clientRequestId,
    deletedForEveryone: false,
    readBy: [
      {
        userId: senderId,
        seenAt: createdAt
      }
    ],
    createdAt,
    updatedAt: createdAt,
    editedAt: null,
    deletedAt: null
  };
}

function createPostRecord({
  id = new mongoose.Types.ObjectId().toString(),
  userId,
  content = "",
  imageUrl = "",
  voiceNote = null,
  clientRequestId = null,
  createdAt = new Date()
}) {
  return {
    _id: id,
    userId,
    clientRequestId,
    content,
    imageUrl,
    voiceNote,
    location: {
      township: "Boitekong",
      extension: "1"
    },
    reactions: {},
    status: "active",
    commentCount: 0,
    createdAt,
    updatedAt: createdAt
  };
}

function matchesMessageFilter(message, filter = {}) {
  if (filter._id && String(message._id) !== String(filter._id)) {
    return false;
  }

  if (filter.conversationId) {
    const conversationIds = Array.isArray(filter.conversationId?.$in)
      ? filter.conversationId.$in
      : [filter.conversationId];

    if (!conversationIds.some((conversationId) => String(message.conversationId) === String(conversationId))) {
      return false;
    }
  }

  if (filter.senderId && String(message.senderId) !== String(filter.senderId)) {
    return false;
  }

  if (
    Object.prototype.hasOwnProperty.call(filter, "clientRequestId") &&
    (message.clientRequestId || null) !== filter.clientRequestId
  ) {
    return false;
  }

  if (
    Object.prototype.hasOwnProperty.call(filter, "deletedForEveryone") &&
    message.deletedForEveryone !== filter.deletedForEveryone
  ) {
    return false;
  }

  if (filter.createdAt?.$gte && new Date(message.createdAt).getTime() < filter.createdAt.$gte.getTime()) {
    return false;
  }

  return true;
}

function matchesPostFilter(post, filter = {}) {
  if (filter.userId && String(post.userId) !== String(filter.userId)) {
    return false;
  }

  if (
    Object.prototype.hasOwnProperty.call(filter, "clientRequestId") &&
    (post.clientRequestId || null) !== filter.clientRequestId
  ) {
    return false;
  }

  if (filter.status && post.status !== filter.status) {
    return false;
  }

  if (filter.createdAt?.$gte && new Date(post.createdAt).getTime() < filter.createdAt.$gte.getTime()) {
    return false;
  }

  return true;
}

function matchesIdInFilter(recordId, filter = {}) {
  const values = filter?._id?.$in;

  if (!Array.isArray(values)) {
    return true;
  }

  return values.some((value) => String(value) === String(recordId));
}

function createDirectMessageTestHarness({ messages = [] } = {}) {
  const currentUser = createUserRecord({
    username: "sender"
  });
  const recipientUser = createUserRecord({
    username: "recipient"
  });
  const conversation = createConversationRecord({
    participantIds: [currentUser._id, recipientUser._id]
  });
  const messageStore = [...messages];
  let createCallCount = 0;

  return {
    currentUser,
    conversation,
    messageStore,
    getCreateCallCount: () => createCallCount,
    patches: [
      {
        target: User,
        methodName: "findById",
        implementation: (userId) => {
          if (String(userId) === String(currentUser._id)) {
            return createQuery(currentUser);
          }

          if (String(userId) === String(recipientUser._id)) {
            return createQuery(recipientUser);
          }

          return createQuery(null);
        }
      },
      {
        target: User,
        methodName: "find",
        implementation: (filter = {}) =>
          createQuery([currentUser, recipientUser].filter((user) => matchesIdInFilter(user._id, filter)))
      },
      {
        target: Conversation,
        methodName: "findById",
        implementation: async (conversationId) =>
          String(conversationId) === String(conversation._id) ? conversation : null
      },
      {
        target: Message,
        methodName: "findOne",
        implementation: async (filter = {}) =>
          messageStore.find((message) => matchesMessageFilter(message, filter)) || null
      },
      {
        target: Message,
        methodName: "find",
        implementation: (filter = {}) =>
          createQuery(messageStore.filter((message) => matchesMessageFilter(message, filter)))
      },
      {
        target: Message,
        methodName: "countDocuments",
        implementation: async () => 0
      },
      {
        target: Post,
        methodName: "countDocuments",
        implementation: async () => 0
      },
      {
        target: Comment,
        methodName: "countDocuments",
        implementation: async () => 0
      },
      {
        target: Message,
        methodName: "create",
        implementation: async (payload) => {
          createCallCount += 1;
          const createdMessage = createMessageRecord({
            ...payload,
            id: new mongoose.Types.ObjectId().toString(),
            createdAt: new Date()
          });
          messageStore.push(createdMessage);
          return createdMessage;
        }
      },
      {
        target: Notification,
        methodName: "create",
        implementation: async () => ({})
      }
    ]
  };
}

function createPostTestHarness({ posts = [] } = {}) {
  const currentUser = createUserRecord({
    username: "poster"
  });
  const postStore = [...posts];
  let createCallCount = 0;

  return {
    currentUser,
    postStore,
    getCreateCallCount: () => createCallCount,
    patches: [
      {
        target: User,
        methodName: "findById",
        implementation: (userId) =>
          createQuery(String(userId) === String(currentUser._id) ? currentUser : null)
      },
      {
        target: User,
        methodName: "find",
        implementation: (filter = {}) =>
          createQuery([currentUser].filter((user) => matchesIdInFilter(user._id, filter)))
      },
      {
        target: Comment,
        methodName: "find",
        implementation: () => createQuery([])
      },
      {
        target: Post,
        methodName: "findOne",
        implementation: async (filter = {}) =>
          postStore.find((post) => matchesPostFilter(post, filter)) || null
      },
      {
        target: Post,
        methodName: "find",
        implementation: (filter = {}) =>
          createQuery(postStore.filter((post) => matchesPostFilter(post, filter)))
      },
      {
        target: Post,
        methodName: "create",
        implementation: async (payload) => {
          createCallCount += 1;
          const createdPost = createPostRecord({
            ...payload,
            id: new mongoose.Types.ObjectId().toString(),
            createdAt: new Date()
          });
          postStore.push(createdPost);
          return createdPost;
        }
      }
    ]
  };
}

const tests = [
  {
    name: "sendMessage reuses an existing DM when the same clientRequestId is replayed",
    async run() {
      const harness = createDirectMessageTestHarness();
      const existingMessage = createMessageRecord({
        conversationId: harness.conversation._id,
        senderId: harness.currentUser._id,
        text: "Hello neighbor",
        clientRequestId: "dm-request-1",
        createdAt: new Date()
      });

      harness.messageStore.push(existingMessage);

      await withPatchedMethods(harness.patches, async () => {
        const conversation = await sendMessage({
          currentUserId: harness.currentUser._id,
          conversationId: harness.conversation._id,
          clientRequestId: "dm-request-1",
          text: "Hello neighbor"
        });

        assert.equal(harness.getCreateCallCount(), 0);
        assert.equal(conversation.messages.length, 1);
        assert.equal(conversation.messages[0].id, String(existingMessage._id));
      });
    }
  },
  {
    name: "sendMessage accepts an encrypted DM voice note payload",
    async run() {
      const harness = createDirectMessageTestHarness();

      await withPatchedMethods(harness.patches, async () => {
        const conversation = await sendMessage({
          currentUserId: harness.currentUser._id,
          conversationId: harness.conversation._id,
          encryption: {
            iv: "AQIDBAUGBwgJCgsM",
            senderKeyId: "dmk_sender",
            recipientKeyId: "dmk_recipient",
            senderPublicKeyJwk: {
              kty: "EC",
              crv: "P-256",
              x: "abc",
              y: "def"
            },
            recipientPublicKeyJwk: {
              kty: "EC",
              crv: "P-256",
              x: "ghi",
              y: "jkl"
            }
          },
          voiceNote: {
            encryptedAudioBase64: "AQIDBAUGBwgJCgsM",
            mimeType: "audio/webm",
            durationMs: 1200,
            size: 12,
            waveform: [0.2, 0.5, 0.8]
          }
        });

        assert.equal(harness.getCreateCallCount(), 1);
        assert.equal(conversation.messages.length, 1);
        assert.equal(
          conversation.messages[0].voiceNote?.encryptedAudioBase64,
          "AQIDBAUGBwgJCgsM"
        );
        assert.equal(conversation.messages[0].voiceNote?.audioBase64, "");
      });
    }
  },
  {
    name: "sendMessage rejects an oversized encrypted DM voice note payload",
    async run() {
      const harness = createDirectMessageTestHarness();
      const oversizedEncryptedPayload = Buffer.alloc(MAX_VOICE_NOTE_AUDIO_BYTES + 1, 1).toString("base64");

      await withPatchedMethods(harness.patches, async () => {
        await assert.rejects(
          () =>
            sendMessage({
              currentUserId: harness.currentUser._id,
              conversationId: harness.conversation._id,
              encryption: {
                iv: "AQIDBAUGBwgJCgsM",
                senderKeyId: "dmk_sender",
                recipientKeyId: "dmk_recipient",
                senderPublicKeyJwk: {
                  kty: "EC",
                  crv: "P-256",
                  x: "abc",
                  y: "def"
                },
                recipientPublicKeyJwk: {
                  kty: "EC",
                  crv: "P-256",
                  x: "ghi",
                  y: "jkl"
                }
              },
              voiceNote: {
                encryptedAudioBase64: oversizedEncryptedPayload,
                mimeType: "audio/webm",
                durationMs: 1200,
                size: MAX_VOICE_NOTE_AUDIO_BYTES + 1,
                waveform: [0.2, 0.5, 0.8]
              }
            }),
          (error) => {
            assert.equal(error?.code, "VOICE_NOTE_AUDIO_TOO_LARGE");
            return true;
          }
        );

        assert.equal(harness.getCreateCallCount(), 0);
      });
    }
  },
  {
    name: "sendMessage suppresses a recent duplicate DM payload even without a clientRequestId",
    async run() {
      const harness = createDirectMessageTestHarness();
      const existingMessage = createMessageRecord({
        conversationId: harness.conversation._id,
        senderId: harness.currentUser._id,
        text: "Fast double send",
        createdAt: new Date()
      });

      harness.messageStore.push(existingMessage);

      await withPatchedMethods(harness.patches, async () => {
        const conversation = await sendMessage({
          currentUserId: harness.currentUser._id,
          conversationId: harness.conversation._id,
          text: "Fast double send"
        });

        assert.equal(harness.getCreateCallCount(), 0);
        assert.equal(conversation.messages.length, 1);
        assert.equal(conversation.messages[0].id, String(existingMessage._id));
      });
    }
  },
  {
    name: "createPost reuses an existing post when the same clientRequestId is replayed",
    async run() {
      const harness = createPostTestHarness();
      const existingPost = createPostRecord({
        userId: harness.currentUser._id,
        content: "Community water update",
        imageUrl: "",
        clientRequestId: "post-request-1",
        createdAt: new Date()
      });

      harness.postStore.push(existingPost);

      await withPatchedMethods(harness.patches, async () => {
        const post = await createPost({
          currentUserId: harness.currentUser._id,
          clientRequestId: "post-request-1",
          content: "Community water update"
        });

        assert.equal(harness.getCreateCallCount(), 0);
        assert.equal(post.id, String(existingPost._id));
      });
    }
  },
  {
    name: "createPost suppresses a recent duplicate post payload even without a clientRequestId",
    async run() {
      const harness = createPostTestHarness();
      const existingPost = createPostRecord({
        userId: harness.currentUser._id,
        content: "Road closed near extension 1",
        imageUrl: "",
        createdAt: new Date()
      });

      harness.postStore.push(existingPost);

      await withPatchedMethods(harness.patches, async () => {
        const post = await createPost({
          currentUserId: harness.currentUser._id,
          content: "Road closed near extension 1"
        });

        assert.equal(harness.getCreateCallCount(), 0);
        assert.equal(post.id, String(existingPost._id));
      });
    }
  }
];

async function run() {
  let passed = 0;

  for (const testCase of tests) {
    try {
      await testCase.run();
      passed += 1;
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      console.error(`FAIL ${testCase.name}`);
      console.error(error);
      process.exitCode = 1;
      return;
    }
  }

  console.log(`PASS ${passed}/${tests.length} idempotency checks`);
}

await run();
