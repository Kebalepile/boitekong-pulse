import { validatePostContent } from "../utils/validators.js";

export function createComment({
  postId,
  userId,
  parentId = null,
  content,
  voiceNote = null
}) {
  if (!postId || typeof postId !== "string") {
    throw new Error("A valid postId is required.");
  }

  if (!userId || typeof userId !== "string") {
    throw new Error("A valid userId is required.");
  }

  if (parentId !== null && typeof parentId !== "string") {
    throw new Error("parentId must be null or a valid comment id.");
  }

  return {
    id: crypto.randomUUID(),
    postId,
    userId,
    parentId,
    content: validatePostContent(content),
    voiceNote,
    createdAt: new Date().toISOString(),
    updatedAt: null
  };
}