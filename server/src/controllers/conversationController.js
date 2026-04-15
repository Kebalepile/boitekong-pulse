import {
  archiveAllConversationsForUser,
  archiveSelectedConversationsForUser,
  deleteMessageForEveryone,
  getConversationById,
  getConversationsForUser,
  getOrCreateConversation,
  markConversationRead,
  sendMessage,
  updateMessage
} from "../services/conversationService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getConversations = asyncHandler(async (req, res) => {
  const conversations = await getConversationsForUser(req.user._id);

  res.status(200).json({
    conversations
  });
});

export const getConversation = asyncHandler(async (req, res) => {
  const conversation = await getConversationById(req.user._id, req.params.conversationId);

  res.status(200).json({
    conversation
  });
});

export const getOrCreateDirectConversation = asyncHandler(async (req, res) => {
  const conversation = await getOrCreateConversation({
    currentUserId: req.user._id,
    targetUserId: req.params.userId
  });

  res.status(200).json({
    conversation
  });
});

export const markConversationReadHandler = asyncHandler(async (req, res) => {
  const conversation = await markConversationRead({
    currentUserId: req.user._id,
    conversationId: req.params.conversationId
  });

  res.status(200).json({
    conversation
  });
});

export const sendMessageHandler = asyncHandler(async (req, res) => {
  const conversation = await sendMessage({
    currentUserId: req.user._id,
    conversationId: req.params.conversationId,
    clientRequestId: req.body.clientRequestId,
    replyToMessageId: req.body.replyToMessageId,
    text: req.body.text,
    encryptedText: req.body.encryptedText,
    encryption: req.body.encryption || null,
    voiceNote: req.body.voiceNote || null
  });

  res.status(201).json({
    message: "Message sent.",
    conversation
  });
});

export const updateMessageHandler = asyncHandler(async (req, res) => {
  const conversation = await updateMessage({
    currentUserId: req.user._id,
    conversationId: req.params.conversationId,
    messageId: req.params.messageId,
    text: req.body.text,
    encryptedText: req.body.encryptedText,
    encryption: req.body.encryption || null
  });

  res.status(200).json({
    message: "Message updated.",
    conversation
  });
});

export const deleteMessageHandler = asyncHandler(async (req, res) => {
  const conversation = await deleteMessageForEveryone({
    currentUserId: req.user._id,
    conversationId: req.params.conversationId,
    messageId: req.params.messageId
  });

  res.status(200).json({
    message: "Message deleted.",
    conversation
  });
});

export const archiveSelectedConversationsHandler = asyncHandler(async (req, res) => {
  const conversations = await archiveSelectedConversationsForUser({
    currentUserId: req.user._id,
    conversationIds: req.body.conversationIds
  });

  res.status(200).json({
    message: "Conversations archived.",
    conversations
  });
});

export const archiveAllConversationsHandler = asyncHandler(async (req, res) => {
  const conversations = await archiveAllConversationsForUser(req.user._id);

  res.status(200).json({
    message: "All conversations archived.",
    conversations
  });
});
