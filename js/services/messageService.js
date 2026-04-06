import { storage } from "../storage/storage.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { createNotification } from "./notificationService.js";
import { areNotificationsEnabled, getDirectMessageAvailability } from "./userService.js";
import { normalizeVoiceNote } from "../utils/voiceNotes.js";

export const MESSAGE_EDIT_WINDOW_MS = 60 * 1000;

function makeError(code, field, message) {
  const error = new Error(message);
  error.code = code;
  error.field = field;
  return error;
}

function normalizeMessageRecord(message = {}, conversationId = "") {
  return {
    id: typeof message.id === "string" && message.id ? message.id : crypto.randomUUID(),
    conversationId:
      typeof message.conversationId === "string" && message.conversationId
        ? message.conversationId
        : conversationId,
    senderId: typeof message.senderId === "string" ? message.senderId : "",
    text: typeof message.text === "string" ? message.text.trim() : "",
    voiceNote: normalizeVoiceNote(message.voiceNote),
    createdAt:
      typeof message.createdAt === "string" && message.createdAt
        ? message.createdAt
        : new Date().toISOString(),
    editedAt:
      typeof message.editedAt === "string" && message.editedAt ? message.editedAt : "",
    deletedAt:
      typeof message.deletedAt === "string" && message.deletedAt ? message.deletedAt : "",
    deletedForEveryone: message.deletedForEveryone === true,
    readBy: Array.isArray(message.readBy)
      ? Array.from(
          new Set(message.readBy.filter((userId) => typeof userId === "string" && userId.trim()))
        )
      : []
  };
}

function normalizeConversationRecord(conversation = {}) {
  const id = typeof conversation.id === "string" && conversation.id ? conversation.id : crypto.randomUUID();
  const participantIds = Array.isArray(conversation.participantIds)
    ? Array.from(
        new Set(
          conversation.participantIds.filter((userId) => typeof userId === "string" && userId.trim())
        )
      )
    : [];
  const hiddenByUserIds = Array.isArray(conversation.hiddenByUserIds)
    ? Array.from(
        new Set(
          conversation.hiddenByUserIds.filter((userId) => typeof userId === "string" && userId.trim())
        )
      )
    : [];
  const messages = Array.isArray(conversation.messages)
    ? conversation.messages
        .map((message) => normalizeMessageRecord(message, id))
        .filter(
          (message) =>
            message.senderId &&
            (message.text || message.voiceNote?.dataUrl || message.deletedForEveryone)
        )
        .sort((first, second) => new Date(first.createdAt) - new Date(second.createdAt))
    : [];
  const fallbackTimestamp = new Date().toISOString();
  const latestMessage = messages[messages.length - 1] || null;

  return {
    id,
    participantIds,
    createdAt:
      typeof conversation.createdAt === "string" && conversation.createdAt
        ? conversation.createdAt
        : latestMessage?.createdAt || fallbackTimestamp,
    updatedAt:
      typeof conversation.updatedAt === "string" && conversation.updatedAt
        ? conversation.updatedAt
        : latestMessage?.createdAt || fallbackTimestamp,
    hiddenByUserIds,
    messages
  };
}

export function getConversations() {
  const conversations = storage.get(STORAGE_KEYS.CONVERSATIONS, []);
  return Array.isArray(conversations) ? conversations.map(normalizeConversationRecord) : [];
}

export function saveConversations(conversations) {
  storage.set(STORAGE_KEYS.CONVERSATIONS, conversations);
}

export function getConversationById(conversationId) {
  if (!conversationId) {
    return null;
  }

  return getConversations().find((conversation) => conversation.id === conversationId) || null;
}

export function getConversationsForUser(userId) {
  return getConversations()
    .filter(
      (conversation) =>
        conversation.participantIds.includes(userId) &&
        !conversation.hiddenByUserIds.includes(userId)
    )
    .sort((first, second) => new Date(second.updatedAt) - new Date(first.updatedAt));
}

export function getConversationWithUser({ currentUserId, targetUserId }) {
  if (!currentUserId || !targetUserId) {
    return null;
  }

  return (
    getConversations().find((conversation) => {
      if (conversation.participantIds.length !== 2) {
        return false;
      }

      return (
        conversation.participantIds.includes(currentUserId) &&
        conversation.participantIds.includes(targetUserId)
      );
    }) || null
  );
}

export function getOrCreateConversation({ currentUserId, targetUserId }) {
  if (!currentUserId || !targetUserId) {
    throw makeError("CONVERSATION_INVALID", null, "Could not open that conversation.");
  }

  if (currentUserId === targetUserId) {
    throw makeError("CONVERSATION_SELF", null, "You cannot message yourself.");
  }

  const existingConversation = getConversationWithUser({
    currentUserId,
    targetUserId
  });

  if (existingConversation) {
    if (existingConversation.hiddenByUserIds.includes(currentUserId)) {
      const conversations = getConversations();
      const conversationIndex = conversations.findIndex(
        (conversation) => conversation.id === existingConversation.id
      );

      if (conversationIndex !== -1) {
        conversations[conversationIndex] = {
          ...conversations[conversationIndex],
          hiddenByUserIds: conversations[conversationIndex].hiddenByUserIds.filter(
            (userId) => userId !== currentUserId
          )
        };
        saveConversations(conversations);
        return conversations[conversationIndex];
      }
    }

    return existingConversation;
  }

  const now = new Date().toISOString();
  const conversations = getConversations();
  const nextConversation = normalizeConversationRecord({
    id: crypto.randomUUID(),
    participantIds: [currentUserId, targetUserId],
    createdAt: now,
    updatedAt: now,
    hiddenByUserIds: [],
    messages: []
  });

  conversations.push(nextConversation);
  saveConversations(conversations);

  return nextConversation;
}

export function sendMessage({ conversationId, senderId, text, voiceNote = null }) {
  const safeText = typeof text === "string" ? text.trim() : "";
  const safeVoiceNote = normalizeVoiceNote(voiceNote);

  if (!safeText && !safeVoiceNote?.dataUrl) {
    throw makeError("MESSAGE_EMPTY", "message", "Write a message or record a voice note.");
  }

  if (safeText && safeVoiceNote?.dataUrl) {
    throw makeError("MESSAGE_MODE_INVALID", "message", "Send text or a voice note, not both.");
  }

  const conversations = getConversations();
  const conversationIndex = conversations.findIndex(
    (conversation) => conversation.id === conversationId
  );

  if (conversationIndex === -1) {
    throw makeError("CONVERSATION_NOT_FOUND", null, "Conversation not found.");
  }

  const conversation = conversations[conversationIndex];

  if (!conversation.participantIds.includes(senderId)) {
    throw makeError("MESSAGE_FORBIDDEN", null, "You cannot send a message to this conversation.");
  }

  const recipientUserId = conversation.participantIds.find((userId) => userId !== senderId);
  const availability = getDirectMessageAvailability({
    senderUserId: senderId,
    recipientUserId
  });

  if (!availability.allowed) {
    throw makeError(availability.code, null, availability.message);
  }

  const message = normalizeMessageRecord(
    {
      id: crypto.randomUUID(),
      conversationId,
      senderId,
      text: safeText,
      voiceNote: safeVoiceNote,
      createdAt: new Date().toISOString(),
      readBy: [senderId]
    },
    conversationId
  );

  conversations[conversationIndex] = {
    ...conversation,
    updatedAt: message.createdAt,
    hiddenByUserIds: [],
    messages: [...conversation.messages, message]
  };

  saveConversations(conversations);

  if (recipientUserId && areNotificationsEnabled(recipientUserId)) {
    createNotification({
      userId: recipientUserId,
      type: "dm",
      actorUserId: senderId,
      conversationId,
      messageId: message.id,
      title: "New message",
      text: ""
    });
  }

  return conversations[conversationIndex];
}

export function markConversationRead({ conversationId, userId }) {
  const conversations = getConversations();
  const conversationIndex = conversations.findIndex(
    (conversation) => conversation.id === conversationId
  );

  if (conversationIndex === -1) {
    return null;
  }

  const conversation = conversations[conversationIndex];
  let didChange = false;
  const nextMessages = conversation.messages.map((message) => {
    if (message.senderId === userId || message.readBy.includes(userId)) {
      return message;
    }

    didChange = true;
    return {
      ...message,
      readBy: [...message.readBy, userId]
    };
  });

  if (!didChange) {
    return conversation;
  }

  conversations[conversationIndex] = {
    ...conversation,
    messages: nextMessages
  };

  saveConversations(conversations);
  return conversations[conversationIndex];
}

export function canEditMessage({ message, userId, now = Date.now() }) {
  if (!message || !userId || message.senderId !== userId || message.deletedForEveryone) {
    return false;
  }

  const createdAtMs = new Date(message.createdAt).getTime();

  if (Number.isNaN(createdAtMs)) {
    return false;
  }

  return now - createdAtMs <= MESSAGE_EDIT_WINDOW_MS;
}

export function updateMessage({ conversationId, messageId, userId, text }) {
  const safeText = typeof text === "string" ? text.trim() : "";

  if (!safeText) {
    throw makeError("MESSAGE_EMPTY", "message", "Write a message before saving.");
  }

  const conversations = getConversations();
  const conversationIndex = conversations.findIndex(
    (conversation) => conversation.id === conversationId
  );

  if (conversationIndex === -1) {
    throw makeError("CONVERSATION_NOT_FOUND", null, "Conversation not found.");
  }

  const conversation = conversations[conversationIndex];
  const messageIndex = conversation.messages.findIndex((message) => message.id === messageId);

  if (messageIndex === -1) {
    throw makeError("MESSAGE_NOT_FOUND", null, "Message not found.");
  }

  const message = conversation.messages[messageIndex];

  if (!canEditMessage({ message, userId })) {
    throw makeError("MESSAGE_EDIT_WINDOW_EXPIRED", null, "That message can no longer be edited.");
  }

  const updatedAt = new Date().toISOString();
  const nextMessages = [...conversation.messages];
  nextMessages[messageIndex] = {
    ...message,
    text: safeText,
    editedAt: updatedAt
  };

  conversations[conversationIndex] = {
    ...conversation,
    updatedAt,
    messages: nextMessages
  };

  saveConversations(conversations);
  return conversations[conversationIndex];
}

export function deleteMessageForEveryone({ conversationId, messageId, userId }) {
  const conversations = getConversations();
  const conversationIndex = conversations.findIndex(
    (conversation) => conversation.id === conversationId
  );

  if (conversationIndex === -1) {
    throw makeError("CONVERSATION_NOT_FOUND", null, "Conversation not found.");
  }

  const conversation = conversations[conversationIndex];
  const messageIndex = conversation.messages.findIndex((message) => message.id === messageId);

  if (messageIndex === -1) {
    throw makeError("MESSAGE_NOT_FOUND", null, "Message not found.");
  }

  const message = conversation.messages[messageIndex];

  if (message.senderId !== userId) {
    throw makeError(
      "MESSAGE_DELETE_FORBIDDEN",
      null,
      "You can only delete your own messages."
    );
  }

  if (message.deletedForEveryone) {
    return conversation;
  }

  const deletedAt = new Date().toISOString();
  const nextMessages = [...conversation.messages];
  nextMessages[messageIndex] = {
    ...message,
    text: "",
    voiceNote: null,
    deletedForEveryone: true,
    deletedAt,
    editedAt: ""
  };

  conversations[conversationIndex] = {
    ...conversation,
    updatedAt: deletedAt,
    messages: nextMessages
  };

  saveConversations(conversations);
  return conversations[conversationIndex];
}

export function archiveConversationForUser({ conversationId, userId }) {
  const conversations = getConversations();
  const conversationIndex = conversations.findIndex(
    (conversation) => conversation.id === conversationId
  );

  if (conversationIndex === -1) {
    return null;
  }

  const conversation = conversations[conversationIndex];

  if (
    !conversation.participantIds.includes(userId) ||
    conversation.hiddenByUserIds.includes(userId)
  ) {
    return conversation;
  }

  conversations[conversationIndex] = {
    ...conversation,
    hiddenByUserIds: [...conversation.hiddenByUserIds, userId]
  };

  saveConversations(conversations);
  return conversations[conversationIndex];
}

export function archiveSelectedConversationsForUser({ conversationIds, userId }) {
  if (!Array.isArray(conversationIds) || conversationIds.length === 0 || !userId) {
    return getConversations();
  }

  const selectedIds = new Set(
    conversationIds.filter((conversationId) => typeof conversationId === "string" && conversationId)
  );
  const conversations = getConversations();
  let didChange = false;
  const nextConversations = conversations.map((conversation) => {
    if (
      !selectedIds.has(conversation.id) ||
      !conversation.participantIds.includes(userId) ||
      conversation.hiddenByUserIds.includes(userId)
    ) {
      return conversation;
    }

    didChange = true;
    return {
      ...conversation,
      hiddenByUserIds: [...conversation.hiddenByUserIds, userId]
    };
  });

  if (!didChange) {
    return conversations;
  }

  saveConversations(nextConversations);
  return nextConversations;
}

export function archiveAllConversationsForUser(userId) {
  const conversations = getConversations();
  let didChange = false;
  const nextConversations = conversations.map((conversation) => {
    if (
      !conversation.participantIds.includes(userId) ||
      conversation.hiddenByUserIds.includes(userId)
    ) {
      return conversation;
    }

    didChange = true;
    return {
      ...conversation,
      hiddenByUserIds: [...conversation.hiddenByUserIds, userId]
    };
  });

  if (!didChange) {
    return conversations;
  }

  saveConversations(nextConversations);
  return nextConversations;
}

export function getUnreadConversationCount(userId) {
  return getConversationsForUser(userId).filter((conversation) =>
    conversation.messages.some(
      (message) => message.senderId !== userId && !message.readBy.includes(userId)
    )
  ).length;
}

export function getUnreadMessageCountForConversation({ conversationId, userId }) {
  const conversation = getConversationById(conversationId);

  if (!conversation) {
    return 0;
  }

  return conversation.messages.filter(
    (message) => message.senderId !== userId && !message.readBy.includes(userId)
  ).length;
}
