import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/appError.js";
import {
  normalizeEncryptedMessageText,
  normalizeMessageEncryptionPayload
} from "../utils/directMessageEncryption.js";
import {
  hasVoiceNoteContent,
  normalizeVoiceNoteInput,
  serializeVoiceNote
} from "../utils/voiceNotes.js";
import {
  publishToUser,
  publishToUsers
} from "./realtimeService.js";
import { getDirectMessageAvailability, serializeUser } from "./userService.js";
import { assertVoiceNoteCreationAllowed } from "./voiceNoteQuotaService.js";

export const MESSAGE_EDIT_WINDOW_MS = 60 * 1000;
const MAX_MESSAGE_TEXT_LENGTH = 2000;
const MAX_ENCRYPTED_MESSAGE_LENGTH = 8192;
const MESSAGE_DUPLICATE_WINDOW_MS = 4000;
const MAX_CLIENT_REQUEST_ID_LENGTH = 128;

function makeObjectIdError(field, message) {
  return new AppError(message, {
    statusCode: 400,
    code: "OBJECT_ID_INVALID",
    field
  });
}

function assertObjectId(value, field) {
  if (!mongoose.isValidObjectId(value)) {
    throw makeObjectIdError(field, `${field} is invalid.`);
  }
}

function toIdString(value) {
  return value ? String(value) : "";
}

function normalizeMessageText(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function normalizeClientRequestId(clientRequestId) {
  const normalizedClientRequestId =
    typeof clientRequestId === "string" ? clientRequestId.trim() : "";

  if (!normalizedClientRequestId) {
    return "";
  }

  if (normalizedClientRequestId.length > MAX_CLIENT_REQUEST_ID_LENGTH) {
    throw new AppError(
      `Message request IDs must be ${MAX_CLIENT_REQUEST_ID_LENGTH} characters or fewer.`,
      {
        statusCode: 400,
        code: "MESSAGE_REQUEST_ID_INVALID",
        field: "clientRequestId"
      }
    );
  }

  return normalizedClientRequestId;
}

function normalizeReplyToMessageId(replyToMessageId) {
  const normalizedReplyToMessageId =
    typeof replyToMessageId === "string" ? replyToMessageId.trim() : "";

  if (!normalizedReplyToMessageId) {
    return "";
  }

  assertObjectId(normalizedReplyToMessageId, "replyToMessageId");
  return normalizedReplyToMessageId;
}

function validateMessageInput({
  text = "",
  encryptedText = "",
  encryption = null,
  voiceNote = null,
  field = "message"
}) {
  const normalizedText = normalizeMessageText(text);
  const normalizedEncryptedText = normalizeEncryptedMessageText(encryptedText);
  const normalizedEncryption = normalizedEncryptedText
    ? normalizeMessageEncryptionPayload(encryption)
    : null;
  const normalizedVoiceNote = normalizeVoiceNoteInput(voiceNote);
  const hasText = Boolean(normalizedText);
  const hasEncryptedText = Boolean(normalizedEncryptedText);
  const hasVoiceNote = Boolean(normalizedVoiceNote);

  if (!hasText && !hasEncryptedText && !hasVoiceNote) {
    throw new AppError("Write a message or record a voice note.", {
      statusCode: 400,
      code: "MESSAGE_EMPTY",
      field
    });
  }

  if ((hasText || hasEncryptedText) && hasVoiceNote) {
    throw new AppError("Send text or a voice note, not both.", {
      statusCode: 400,
      code: "MESSAGE_MODE_INVALID",
      field
    });
  }

  if (hasText && hasEncryptedText) {
    throw new AppError("Send plaintext or encrypted text, not both.", {
      statusCode: 400,
      code: "MESSAGE_ENCRYPTION_MODE_INVALID",
      field
    });
  }

  if (hasText && normalizedText.length > MAX_MESSAGE_TEXT_LENGTH) {
    throw new AppError(`Message text must be ${MAX_MESSAGE_TEXT_LENGTH} characters or fewer.`, {
      statusCode: 400,
      code: "MESSAGE_TOO_LONG",
      field
    });
  }

  if (hasEncryptedText && normalizedEncryptedText.length > MAX_ENCRYPTED_MESSAGE_LENGTH) {
    throw new AppError("Encrypted message payload is too large.", {
      statusCode: 400,
      code: "MESSAGE_ENCRYPTED_TOO_LONG",
      field
    });
  }

  if (hasEncryptedText && !normalizedEncryption) {
    throw new AppError("Encrypted message metadata is invalid.", {
      statusCode: 400,
      code: "MESSAGE_ENCRYPTION_INVALID",
      field
    });
  }

  return {
    text: hasText ? normalizedText : "",
    encryptedText: hasEncryptedText ? normalizedEncryptedText : "",
    encryption: hasEncryptedText ? normalizedEncryption : null,
    voiceNote: normalizedVoiceNote
  };
}

function serializeReadBy(readBy = []) {
  return Array.isArray(readBy)
    ? readBy
        .map((entry) => toIdString(entry?.userId || entry))
        .filter(Boolean)
    : [];
}

function getVoiceNoteSignature(voiceNote = null) {
  if (!voiceNote) {
    return "";
  }

  const audioData =
    voiceNote.audioData && Buffer.isBuffer(voiceNote.audioData) && voiceNote.audioData.length > 0
      ? createHash("sha256").update(voiceNote.audioData).digest("hex")
      : "";

  return JSON.stringify({
    audioData,
    url: typeof voiceNote.url === "string" ? voiceNote.url : "",
    storageKey: typeof voiceNote.storageKey === "string" ? voiceNote.storageKey : "",
    mimeType: typeof voiceNote.mimeType === "string" ? voiceNote.mimeType : "",
    durationMs: Number(voiceNote.durationMs || 0),
    size: Number(voiceNote.size || voiceNote.sizeBytes || 0),
    waveform: Array.isArray(voiceNote.waveform) ? voiceNote.waveform : []
  });
}

function getMessagePayloadSignature({
  replyToMessageId = "",
  text = "",
  encryptedText = "",
  encryption = null,
  voiceNote = null
}) {
  return JSON.stringify({
    replyToMessageId: normalizeReplyToMessageId(toIdString(replyToMessageId)),
    text: normalizeMessageText(text),
    encryptedText: normalizeEncryptedMessageText(encryptedText),
    encryption: encryption || null,
    voiceNote: getVoiceNoteSignature(voiceNote)
  });
}

function isSameMessagePayload(message, safeMessage) {
  return getMessagePayloadSignature(message) === getMessagePayloadSignature(safeMessage);
}

function serializeMessage(message) {
  return {
    id: toIdString(message._id),
    conversationId: toIdString(message.conversationId),
    senderId: toIdString(message.senderId),
    replyToMessageId: toIdString(message.replyToMessageId),
    text: message.text || "",
    encryptedText: message.encryptedText || "",
    encryption: message.encryption || null,
    voiceNote: serializeVoiceNote(message.voiceNote),
    createdAt: message.createdAt,
    editedAt: message.editedAt || "",
    deletedAt: message.deletedAt || "",
    deletedForEveryone: message.deletedForEveryone === true,
    readBy: serializeReadBy(message.readBy)
  };
}

async function loadUsersMap(userIds) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));

  if (uniqueIds.length === 0) {
    return new Map();
  }

  const users = await User.find({
    _id: { $in: uniqueIds }
  });

  return new Map(users.map((user) => [toIdString(user._id), user]));
}

async function serializeConversations(conversations) {
  const safeConversations = conversations.map((conversation) =>
    typeof conversation.toObject === "function" ? conversation.toObject() : conversation
  );

  if (safeConversations.length === 0) {
    return [];
  }

  const conversationIds = safeConversations.map((conversation) => conversation._id);
  const messages = await Message.find({
    conversationId: { $in: conversationIds }
  }).sort({ createdAt: 1 });
  const messagesByConversationId = new Map();
  const participantIds = [];

  safeConversations.forEach((conversation) => {
    messagesByConversationId.set(toIdString(conversation._id), []);
    conversation.participantIds.forEach((participantId) => {
      participantIds.push(toIdString(participantId));
    });
  });

  messages.forEach((message) => {
    const conversationId = toIdString(message.conversationId);

    if (!messagesByConversationId.has(conversationId)) {
      messagesByConversationId.set(conversationId, []);
    }

    messagesByConversationId.get(conversationId).push(message);
  });

  const usersById = await loadUsersMap(participantIds);

  return safeConversations
    .map((conversation) => {
      const conversationId = toIdString(conversation._id);
      const serializedMessages = (messagesByConversationId.get(conversationId) || []).map((message) =>
        serializeMessage(message)
      );
      const participantUsers = conversation.participantIds
        .map((participantId) => usersById.get(toIdString(participantId)) || null)
        .filter(Boolean)
        .map((user) => serializeUser(user));

      return {
        id: conversationId,
        participantIds: conversation.participantIds.map((participantId) => toIdString(participantId)),
        participants: participantUsers,
        hiddenByUserIds: Array.isArray(conversation.archivedByUserIds)
          ? conversation.archivedByUserIds.map((participantId) => toIdString(participantId))
          : [],
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt || conversation.lastMessageAt || conversation.createdAt,
        messages: serializedMessages
      };
    })
    .sort((first, second) => new Date(second.updatedAt) - new Date(first.updatedAt));
}

async function serializeSingleConversation(conversation) {
  const [serializedConversation] = await serializeConversations([conversation]);
  return serializedConversation || null;
}

async function serializeLatestConversation(conversationId) {
  const latestConversation = await Conversation.findById(conversationId);
  return latestConversation ? serializeSingleConversation(latestConversation) : null;
}

async function requireConversationForParticipant(conversationId, userId) {
  assertObjectId(conversationId, "conversationId");

  const conversation = await Conversation.findById(conversationId);

  if (!conversation) {
    throw new AppError("Conversation not found.", {
      statusCode: 404,
      code: "CONVERSATION_NOT_FOUND"
    });
  }

  if (!conversation.participantIds.some((participantId) => toIdString(participantId) === toIdString(userId))) {
    throw new AppError("Conversation not found.", {
      statusCode: 404,
      code: "CONVERSATION_NOT_FOUND"
    });
  }

  return conversation;
}

async function requireMessageForConversation(conversationId, messageId) {
  assertObjectId(messageId, "messageId");

  const message = await Message.findOne({
    _id: messageId,
    conversationId
  });

  if (!message) {
    throw new AppError("Message not found.", {
      statusCode: 404,
      code: "MESSAGE_NOT_FOUND"
    });
  }

  return message;
}

async function requireReplyTargetMessage(conversationId, replyToMessageId) {
  const safeReplyToMessageId = normalizeReplyToMessageId(replyToMessageId);

  if (!safeReplyToMessageId) {
    return null;
  }

  const replyTargetMessage = await Message.findOne({
    _id: safeReplyToMessageId,
    conversationId
  });

  if (!replyTargetMessage) {
    throw new AppError("Reply target message not found.", {
      statusCode: 400,
      code: "MESSAGE_REPLY_TARGET_NOT_FOUND",
      field: "replyToMessageId"
    });
  }

  return replyTargetMessage;
}

async function findRecentDuplicateMessage({
  conversationId,
  senderId,
  safeMessage
}) {
  const recentMessages = await Message.find({
    conversationId,
    senderId,
    deletedForEveryone: false,
    createdAt: {
      $gte: new Date(Date.now() - MESSAGE_DUPLICATE_WINDOW_MS)
    }
  })
    .sort({ createdAt: -1 })
    .limit(5);

  return recentMessages.find((message) => isSameMessagePayload(message, safeMessage)) || null;
}

function isClientRequestIdDuplicateError(error) {
  return (
    error?.code === 11000 &&
    Boolean(error?.keyPattern?.conversationId) &&
    Boolean(error?.keyPattern?.senderId) &&
    Boolean(error?.keyPattern?.clientRequestId)
  );
}

async function createNotificationIfAllowed({
  recipientUserId,
  actorUserId,
  conversationId,
  messageId
}) {
  if (!recipientUserId || toIdString(recipientUserId) === toIdString(actorUserId)) {
    return null;
  }

  const recipient = await User.findById(recipientUserId).select("notificationsEnabled");

  if (!recipient || recipient.notificationsEnabled === false) {
    return null;
  }

  const notification = await Notification.create({
    userId: recipientUserId,
    actorUserId,
    type: "dm",
    conversationId,
    messageId,
    title: "New message",
    text: ""
  });

  publishToUser(toIdString(recipientUserId), {
    type: "notifications.updated",
    conversationId: toIdString(conversationId),
    messageId: toIdString(messageId),
    notificationType: "dm"
  });

  return notification;
}

function publishConversationUpdate(conversation, reason = "") {
  const participantIds = Array.isArray(conversation?.participantIds)
    ? conversation.participantIds.map((participantId) => toIdString(participantId)).filter(Boolean)
    : [];

  if (participantIds.length === 0) {
    return;
  }

  publishToUsers(participantIds, {
    type: "conversations.updated",
    conversationId: toIdString(conversation?._id || conversation?.id),
    ...(reason ? { reason } : {})
  });
}

export function canEditMessage({ message, userId, now = Date.now() }) {
  if (!message || !userId || toIdString(message.senderId) !== toIdString(userId) || message.deletedForEveryone) {
    return false;
  }

  const createdAtMs = new Date(message.createdAt).getTime();

  if (Number.isNaN(createdAtMs)) {
    return false;
  }

  return now - createdAtMs <= MESSAGE_EDIT_WINDOW_MS;
}

export async function getConversationsForUser(currentUserId) {
  assertObjectId(currentUserId, "userId");

  const conversations = await Conversation.find({
    participantIds: currentUserId,
    archivedByUserIds: { $ne: currentUserId }
  }).sort({ lastMessageAt: -1, updatedAt: -1 });

  return serializeConversations(conversations);
}

export async function getConversationById(currentUserId, conversationId) {
  const conversation = await requireConversationForParticipant(conversationId, currentUserId);
  return serializeSingleConversation(conversation);
}

export async function getOrCreateConversation({ currentUserId, targetUserId }) {
  assertObjectId(currentUserId, "userId");
  assertObjectId(targetUserId, "targetUserId");

  if (toIdString(currentUserId) === toIdString(targetUserId)) {
    throw new AppError("You cannot message yourself.", {
      statusCode: 400,
      code: "CONVERSATION_SELF"
    });
  }

  const [currentUser, targetUser] = await Promise.all([
    User.findById(currentUserId),
    User.findById(targetUserId)
  ]);

  if (!currentUser || !targetUser) {
    throw new AppError("User not found.", {
      statusCode: 404,
      code: "USER_NOT_FOUND"
    });
  }

  let conversation = await Conversation.findOne({
    participantIds: { $all: [currentUserId, targetUserId] }
  }).sort({ updatedAt: -1 });

  if (!conversation) {
    conversation = await Conversation.create({
      participantIds: [currentUserId, targetUserId],
      archivedByUserIds: []
    });
  } else if (conversation.archivedByUserIds.some((userId) => toIdString(userId) === toIdString(currentUserId))) {
    conversation.archivedByUserIds = conversation.archivedByUserIds.filter(
      (userId) => toIdString(userId) !== toIdString(currentUserId)
    );
    await conversation.save();
  }

  return serializeSingleConversation(conversation);
}

export async function sendMessage({
  currentUserId,
  conversationId,
  clientRequestId = "",
  replyToMessageId = "",
  text = "",
  encryptedText = "",
  encryption = null,
  voiceNote = null
}) {
  const conversation = await requireConversationForParticipant(conversationId, currentUserId);
  const recipientUserId =
    conversation.participantIds.find((participantId) => toIdString(participantId) !== toIdString(currentUserId)) ||
    null;
  const availability = await getDirectMessageAvailability(currentUserId, recipientUserId);

  if (!availability.allowed) {
    throw new AppError(availability.message, {
      statusCode: 400,
      code: availability.code
    });
  }

  const safeMessage = validateMessageInput({
    text,
    encryptedText,
    encryption,
    voiceNote
  });
  const safeClientRequestId = normalizeClientRequestId(clientRequestId);
  const replyTargetMessage = await requireReplyTargetMessage(
    conversation._id,
    replyToMessageId
  );
  const comparableMessage = {
    ...safeMessage,
    replyToMessageId: toIdString(replyTargetMessage?._id)
  };

  if (safeClientRequestId) {
    const existingRequestMessage = await Message.findOne({
      conversationId: conversation._id,
      senderId: currentUserId,
      clientRequestId: safeClientRequestId
    });

    if (existingRequestMessage) {
      if (!isSameMessagePayload(existingRequestMessage, comparableMessage)) {
        throw new AppError("That message send request has already been used.", {
          statusCode: 409,
          code: "MESSAGE_REQUEST_ID_REUSED",
          field: "clientRequestId"
        });
      }

      return serializeLatestConversation(conversation._id);
    }
  }

  const duplicateMessage = await findRecentDuplicateMessage({
    conversationId: conversation._id,
    senderId: currentUserId,
    safeMessage: comparableMessage
  });

  if (duplicateMessage) {
    return serializeLatestConversation(conversation._id);
  }

  if (safeMessage.voiceNote) {
    await assertVoiceNoteCreationAllowed(currentUserId);
  }

  const createdAt = new Date();
  let message;

  try {
    message = await Message.create({
      conversationId: conversation._id,
      senderId: currentUserId,
      clientRequestId: safeClientRequestId || null,
      replyToMessageId: replyTargetMessage?._id || null,
      text: safeMessage.text,
      encryptedText: safeMessage.encryptedText,
      encryption: safeMessage.encryption,
      voiceNote: safeMessage.voiceNote,
      readBy: [
        {
          userId: currentUserId,
          seenAt: createdAt
        }
      ]
    });
  } catch (error) {
    if (safeClientRequestId && isClientRequestIdDuplicateError(error)) {
      const existingRequestMessage = await Message.findOne({
        conversationId: conversation._id,
        senderId: currentUserId,
        clientRequestId: safeClientRequestId
      });

      if (existingRequestMessage) {
        if (!isSameMessagePayload(existingRequestMessage, comparableMessage)) {
          throw new AppError("That message send request has already been used.", {
            statusCode: 409,
            code: "MESSAGE_REQUEST_ID_REUSED",
            field: "clientRequestId"
          });
        }

        return serializeLatestConversation(conversation._id);
      }
    }

    throw error;
  }

  conversation.lastMessageId = message._id;
  conversation.lastMessageAt = message.createdAt;
  conversation.archivedByUserIds = [];
  await conversation.save();

  await createNotificationIfAllowed({
    recipientUserId,
    actorUserId: currentUserId,
    conversationId: conversation._id,
    messageId: message._id
  });

  publishConversationUpdate(conversation, "message.created");

  return serializeSingleConversation(conversation);
}

export async function markConversationRead({ currentUserId, conversationId }) {
  const conversation = await requireConversationForParticipant(conversationId, currentUserId);
  const messages = await Message.find({
    conversationId: conversation._id
  });
  const now = new Date();
  const updates = messages.filter(
    (message) =>
      toIdString(message.senderId) !== toIdString(currentUserId) &&
      !message.readBy.some((entry) => toIdString(entry.userId) === toIdString(currentUserId))
  );

  if (updates.length === 0) {
    return serializeSingleConversation(conversation);
  }

  await Promise.all(
    updates.map((message) => {
      message.readBy.push({
        userId: currentUserId,
        seenAt: now
      });
      return message.save();
    })
  );

  publishConversationUpdate(conversation, "conversation.read");

  return serializeSingleConversation(conversation);
}

export async function updateMessage({
  currentUserId,
  conversationId,
  messageId,
  text,
  encryptedText = "",
  encryption = null
}) {
  const conversation = await requireConversationForParticipant(conversationId, currentUserId);
  const message = await requireMessageForConversation(conversation._id, messageId);

  if (!canEditMessage({ message, userId: currentUserId })) {
    throw new AppError("That message can no longer be edited.", {
      statusCode: 400,
      code: "MESSAGE_EDIT_WINDOW_EXPIRED"
    });
  }

  const safeMessage = validateMessageInput({
    text,
    encryptedText,
    encryption,
    voiceNote: null,
    field: "message"
  });
  message.text = safeMessage.text;
  message.encryptedText = safeMessage.encryptedText;
  message.encryption = safeMessage.encryption;
  message.editedAt = new Date();
  await message.save();

  conversation.lastMessageId = message._id;
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();

  publishConversationUpdate(conversation, "message.updated");

  return serializeSingleConversation(conversation);
}

export async function deleteMessageForEveryone({
  currentUserId,
  conversationId,
  messageId
}) {
  const conversation = await requireConversationForParticipant(conversationId, currentUserId);
  const message = await requireMessageForConversation(conversation._id, messageId);

  if (toIdString(message.senderId) !== toIdString(currentUserId)) {
    throw new AppError("You can only delete your own messages.", {
      statusCode: 403,
      code: "MESSAGE_DELETE_FORBIDDEN"
    });
  }

  if (!message.deletedForEveryone) {
    message.text = "";
    message.encryptedText = "";
    message.encryption = null;
    message.voiceNote = null;
    message.deletedForEveryone = true;
    message.deletedAt = new Date();
    message.editedAt = null;
    await message.save();
  }

  conversation.lastMessageId = message._id;
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();

  publishConversationUpdate(conversation, "message.deleted");

  return serializeSingleConversation(conversation);
}

export async function archiveSelectedConversationsForUser({
  currentUserId,
  conversationIds
}) {
  const safeConversationIds = Array.isArray(conversationIds)
    ? conversationIds.filter((conversationId) => mongoose.isValidObjectId(conversationId))
    : [];

  if (safeConversationIds.length === 0) {
    return getConversationsForUser(currentUserId);
  }

  const conversations = await Conversation.find({
    _id: { $in: safeConversationIds },
    participantIds: currentUserId
  });

  await Promise.all(
    conversations.map((conversation) => {
      if (!conversation.archivedByUserIds.some((userId) => toIdString(userId) === toIdString(currentUserId))) {
        conversation.archivedByUserIds.push(currentUserId);
      }

      return conversation.save();
    })
  );

  return getConversationsForUser(currentUserId);
}

export async function archiveAllConversationsForUser(currentUserId) {
  const conversations = await Conversation.find({
    participantIds: currentUserId
  });

  await Promise.all(
    conversations.map((conversation) => {
      if (!conversation.archivedByUserIds.some((userId) => toIdString(userId) === toIdString(currentUserId))) {
        conversation.archivedByUserIds.push(currentUserId);
      }

      return conversation.save();
    })
  );

  return getConversationsForUser(currentUserId);
}
