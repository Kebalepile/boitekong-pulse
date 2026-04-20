import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  archiveSelectedConversationsForUser,
  getConversationsForUser,
  getOrCreateConversation,
  sendMessage
} from "./conversationService.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";

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
  participantIds,
  lastMessageAt = new Date()
}) {
  return {
    _id: id,
    participantIds,
    archivedByUserIds: [],
    clearedByUsers: [],
    lastMessageId: null,
    lastMessageAt,
    createdAt: lastMessageAt,
    updatedAt: lastMessageAt,
    async save() {
      this.updatedAt = new Date();
      return this;
    }
  };
}

function createMessageRecord({
  id = new mongoose.Types.ObjectId().toString(),
  conversationId,
  senderId,
  text = "",
  createdAt = new Date(),
  clientRequestId = null
}) {
  return {
    _id: id,
    conversationId,
    senderId,
    replyToMessageId: null,
    text,
    encryptedText: "",
    encryption: null,
    voiceNote: null,
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

function matchesIdInFilter(recordId, filter = {}) {
  const values = filter?._id?.$in;

  if (!Array.isArray(values)) {
    return true;
  }

  return values.some((value) => String(value) === String(recordId));
}

function matchesConversationFilter(conversation, filter = {}) {
  if (filter._id) {
    const conversationIds = Array.isArray(filter._id?.$in) ? filter._id.$in : [filter._id];

    if (!conversationIds.some((conversationId) => String(conversation._id) === String(conversationId))) {
      return false;
    }
  }

  if (filter.participantIds?.$all) {
    const requiredIds = Array.isArray(filter.participantIds.$all) ? filter.participantIds.$all : [];

    if (!requiredIds.every((participantId) => conversation.participantIds.some((id) => String(id) === String(participantId)))) {
      return false;
    }
  } else if (
    filter.participantIds &&
    !conversation.participantIds.some((participantId) => String(participantId) === String(filter.participantIds))
  ) {
    return false;
  }

  if (filter.archivedByUserIds?.$ne) {
    const archivedUserId = String(filter.archivedByUserIds.$ne);

    if (conversation.archivedByUserIds.some((userId) => String(userId) === archivedUserId)) {
      return false;
    }
  }

  return true;
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

function createHarness() {
  const currentUser = createUserRecord({
    username: "deleter"
  });
  const recipientUser = createUserRecord({
    username: "neighbor"
  });
  const firstMessage = createMessageRecord({
    conversationId: new mongoose.Types.ObjectId().toString(),
    senderId: recipientUser._id,
    text: "Old history one",
    createdAt: new Date("2026-01-01T10:00:00.000Z")
  });
  const secondMessage = createMessageRecord({
    conversationId: firstMessage.conversationId,
    senderId: currentUser._id,
    text: "Old history two",
    createdAt: new Date("2026-01-01T10:05:00.000Z")
  });
  const conversation = createConversationRecord({
    id: firstMessage.conversationId,
    participantIds: [currentUser._id, recipientUser._id],
    lastMessageAt: secondMessage.createdAt
  });

  conversation.lastMessageId = secondMessage._id;

  const conversationStore = [conversation];
  const messageStore = [firstMessage, secondMessage];
  const userStore = [currentUser, recipientUser];

  return {
    currentUser,
    recipientUser,
    conversation,
    conversationStore,
    messageStore,
    patches: [
      {
        target: User,
        methodName: "findById",
        implementation: (userId) =>
          createQuery(userStore.find((user) => String(user._id) === String(userId)) || null)
      },
      {
        target: User,
        methodName: "find",
        implementation: (filter = {}) =>
          createQuery(userStore.filter((user) => matchesIdInFilter(user._id, filter)))
      },
      {
        target: Conversation,
        methodName: "findById",
        implementation: async (conversationId) =>
          conversationStore.find((entry) => String(entry._id) === String(conversationId)) || null
      },
      {
        target: Conversation,
        methodName: "findOne",
        implementation: (filter = {}) =>
          createQuery(conversationStore.find((entry) => matchesConversationFilter(entry, filter)) || null)
      },
      {
        target: Conversation,
        methodName: "find",
        implementation: (filter = {}) =>
          createQuery(conversationStore.filter((entry) => matchesConversationFilter(entry, filter)))
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
        methodName: "create",
        implementation: async (payload) => {
          const createdMessage = createMessageRecord({
            ...payload,
            id: new mongoose.Types.ObjectId().toString(),
            createdAt: new Date("2026-01-01T10:10:00.000Z")
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

const tests = [
  {
    name: "reopening a deleted conversation starts with a fresh empty thread",
    async run() {
      const harness = createHarness();

      await withPatchedMethods(harness.patches, async () => {
        const hiddenConversations = await archiveSelectedConversationsForUser({
          currentUserId: harness.currentUser._id,
          conversationIds: [harness.conversation._id]
        });

        assert.equal(hiddenConversations.length, 0);

        const reopenedConversation = await getOrCreateConversation({
          currentUserId: harness.currentUser._id,
          targetUserId: harness.recipientUser._id
        });

        assert.equal(reopenedConversation.id, String(harness.conversation._id));
        assert.equal(reopenedConversation.messages.length, 0);
      });
    }
  },
  {
    name: "new incoming messages after deletion remain visible without restoring old history",
    async run() {
      const harness = createHarness();

      await withPatchedMethods(harness.patches, async () => {
        await archiveSelectedConversationsForUser({
          currentUserId: harness.currentUser._id,
          conversationIds: [harness.conversation._id]
        });

        const senderView = await sendMessage({
          currentUserId: harness.recipientUser._id,
          conversationId: harness.conversation._id,
          text: "Fresh start"
        });

        assert.equal(senderView.messages.length, 3);

        const deletedUserConversations = await getConversationsForUser(harness.currentUser._id);

        assert.equal(deletedUserConversations.length, 1);
        assert.equal(deletedUserConversations[0].messages.length, 1);
        assert.equal(deletedUserConversations[0].messages[0].text, "Fresh start");
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

  console.log(`Passed ${passed}/${tests.length} tests.`);
}

void run();
