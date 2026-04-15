import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { Comment } from "../models/Comment.js";
import { Notification } from "../models/Notification.js";
import { Post } from "../models/Post.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/appError.js";
import {
  hasVoiceNoteContent,
  normalizeVoiceNoteInput,
  serializeVoiceNote
} from "../utils/voiceNotes.js";
import {
  publishToAll,
  publishToUser
} from "./realtimeService.js";
import { assertVoiceNoteCreationAllowed } from "./voiceNoteQuotaService.js";
import {
  validateCommentContent,
  validateCommentSubmission,
  validateImageUrl,
  validatePostContent,
  validatePostSubmission,
  validateReactionType
} from "../utils/validators.js";

const POST_DUPLICATE_WINDOW_MS = 4000;
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

function normalizeClientRequestId(clientRequestId) {
  const normalizedClientRequestId =
    typeof clientRequestId === "string" ? clientRequestId.trim() : "";

  if (!normalizedClientRequestId) {
    return "";
  }

  if (normalizedClientRequestId.length > MAX_CLIENT_REQUEST_ID_LENGTH) {
    throw new AppError(
      `Post request IDs must be ${MAX_CLIENT_REQUEST_ID_LENGTH} characters or fewer.`,
      {
        statusCode: 400,
        code: "POST_REQUEST_ID_INVALID",
        field: "clientRequestId"
      }
    );
  }

  return normalizedClientRequestId;
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serializeReactionRecord(reactions = {}) {
  return {
    like: Array.isArray(reactions.likeUserIds) ? reactions.likeUserIds.map(toIdString) : [],
    meh: Array.isArray(reactions.mehUserIds) ? reactions.mehUserIds.map(toIdString) : [],
    dislike: Array.isArray(reactions.dislikeUserIds)
      ? reactions.dislikeUserIds.map(toIdString)
      : []
  };
}

function timestampsToFrontendShape(createdAt, updatedAt) {
  if (!updatedAt) {
    return null;
  }

  return new Date(createdAt).getTime() === new Date(updatedAt).getTime() ? null : updatedAt;
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

function getPostPayloadSignature({ content = "", imageUrl = "", voiceNote = null }) {
  return JSON.stringify({
    content,
    imageUrl,
    voiceNote: getVoiceNoteSignature(voiceNote)
  });
}

function isSamePostPayload(post, safePost) {
  return getPostPayloadSignature(post) === getPostPayloadSignature(safePost);
}

function serializeUserPreview(user) {
  if (!user) {
    return null;
  }

  return {
    id: toIdString(user._id),
    username: user.username,
    avatarUrl: user.avatarUrl || "",
    avatarDataUrl: user.avatarUrl || "",
    location: {
      township: user.location?.township || "",
      extension: user.location?.extension || ""
    }
  };
}

function serializeComment(comment, usersById) {
  const commentId = toIdString(comment._id);
  const userId = toIdString(comment.userId);

  return {
    id: commentId,
    postId: toIdString(comment.postId),
    userId,
    parentId: comment.parentId ? toIdString(comment.parentId) : null,
    content: comment.content || "",
    reactions: serializeReactionRecord(comment.reactions),
    voiceNote: serializeVoiceNote(comment.voiceNote),
    createdAt: comment.createdAt,
    updatedAt: timestampsToFrontendShape(comment.createdAt, comment.updatedAt),
    author: serializeUserPreview(usersById.get(userId))
  };
}

function serializePost(post, comments, usersById) {
  const postId = toIdString(post._id);
  const userId = toIdString(post.userId);

  return {
    id: postId,
    userId,
    content: post.content || "",
    image: post.imageUrl || "",
    imageUrl: post.imageUrl || "",
    location: {
      township: post.location?.township || "",
      extension: post.location?.extension || ""
    },
    voiceNote: serializeVoiceNote(post.voiceNote),
    reactions: serializeReactionRecord(post.reactions),
    comments,
    commentCount: comments.length,
    createdAt: post.createdAt,
    updatedAt: timestampsToFrontendShape(post.createdAt, post.updatedAt),
    author: serializeUserPreview(usersById.get(userId))
  };
}

async function loadUsersMap(userIds) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));

  if (uniqueIds.length === 0) {
    return new Map();
  }

  const users = await User.find({ _id: { $in: uniqueIds } })
    .select("username avatarUrl location")
    .lean();

  return new Map(users.map((user) => [toIdString(user._id), user]));
}

async function serializePosts(posts) {
  const safePosts = posts.map((post) => (typeof post.toObject === "function" ? post.toObject() : post));

  if (safePosts.length === 0) {
    return [];
  }

  const postIds = safePosts.map((post) => post._id);
  const comments = await Comment.find({
    postId: { $in: postIds },
    status: "active"
  })
    .sort({ createdAt: 1 })
    .lean();
  const commentsByPostId = new Map();
  const userIds = [];

  safePosts.forEach((post) => {
    userIds.push(toIdString(post.userId));
    commentsByPostId.set(toIdString(post._id), []);
  });

  comments.forEach((comment) => {
    const postId = toIdString(comment.postId);
    userIds.push(toIdString(comment.userId));

    if (!commentsByPostId.has(postId)) {
      commentsByPostId.set(postId, []);
    }

    commentsByPostId.get(postId).push(comment);
  });

  const usersById = await loadUsersMap(userIds);

  return safePosts.map((post) => {
    const serializedComments = (commentsByPostId.get(toIdString(post._id)) || []).map((comment) =>
      serializeComment(comment, usersById)
    );

    return serializePost(post, serializedComments, usersById);
  });
}

async function serializeSinglePost(post) {
  const [serializedPost] = await serializePosts([post]);
  return serializedPost || null;
}

async function findRecentDuplicatePost({
  userId,
  safePost
}) {
  const recentPosts = await Post.find({
    userId,
    status: "active",
    createdAt: {
      $gte: new Date(Date.now() - POST_DUPLICATE_WINDOW_MS)
    }
  })
    .sort({ createdAt: -1 })
    .limit(5);

  return recentPosts.find((post) => isSamePostPayload(post, safePost)) || null;
}

function isClientRequestIdDuplicateError(error) {
  return (
    error?.code === 11000 &&
    Boolean(error?.keyPattern?.userId) &&
    Boolean(error?.keyPattern?.clientRequestId)
  );
}

async function serializeComments(comments) {
  const safeComments = comments.map((comment) =>
    typeof comment.toObject === "function" ? comment.toObject() : comment
  );
  const usersById = await loadUsersMap(safeComments.map((comment) => toIdString(comment.userId)));

  return safeComments.map((comment) => serializeComment(comment, usersById));
}

async function requireActivePost(postId) {
  assertObjectId(postId, "postId");

  const post = await Post.findOne({
    _id: postId,
    status: "active"
  });

  if (!post) {
    throw new AppError("Post not found.", {
      statusCode: 404,
      code: "POST_NOT_FOUND"
    });
  }

  return post;
}

async function requireActiveComment(postId, commentId) {
  assertObjectId(postId, "postId");
  assertObjectId(commentId, "commentId");

  const comment = await Comment.findOne({
    _id: commentId,
    postId,
    status: "active"
  });

  if (!comment) {
    throw new AppError("Comment not found.", {
      statusCode: 404,
      code: "COMMENT_NOT_FOUND"
    });
  }

  return comment;
}

async function requireCurrentUser(currentUserId) {
  assertObjectId(currentUserId, "userId");

  const user = await User.findById(currentUserId);

  if (!user) {
    throw new AppError("User not found.", {
      statusCode: 404,
      code: "USER_NOT_FOUND"
    });
  }

  return user;
}

function updateReactionArray(target, reactionType, userId) {
  const reactionKey = reactionType === "dislike" ? "dislikeUserIds" : "likeUserIds";
  const reactionKeys = ["likeUserIds", "mehUserIds", "dislikeUserIds"];
  const safeUserId = toIdString(userId);
  const currentlyActive = Array.isArray(target[reactionKey])
    ? target[reactionKey].some((entry) => toIdString(entry) === safeUserId)
    : false;

  reactionKeys.forEach((key) => {
    target[key] = Array.isArray(target[key])
      ? target[key].filter((entry) => toIdString(entry) !== safeUserId)
      : [];
  });

  if (!currentlyActive) {
    target[reactionKey].push(userId);
  }

  return !currentlyActive;
}

function collectCommentBranchIds(comments, rootCommentId) {
  const ids = new Set([toIdString(rootCommentId)]);
  let foundNewChild = true;

  while (foundNewChild) {
    foundNewChild = false;

    comments.forEach((comment) => {
      if (
        comment.parentId &&
        ids.has(toIdString(comment.parentId)) &&
        !ids.has(toIdString(comment._id))
      ) {
        ids.add(toIdString(comment._id));
        foundNewChild = true;
      }
    });
  }

  return ids;
}

async function createNotificationIfAllowed({
  recipientUserId,
  actorUserId,
  type,
  postId = null,
  commentId = null,
  title,
  text = ""
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
    type,
    postId,
    commentId,
    title,
    text
  });

  publishToUser(toIdString(recipientUserId), {
    type: "notifications.updated",
    postId: toIdString(postId),
    commentId: toIdString(commentId),
    notificationType: type
  });

  return notification;
}

async function syncReactionNotification({
  recipientUserId,
  actorUserId,
  type,
  postId = null,
  commentId = null,
  title,
  text = "",
  active = false
}) {
  if (!recipientUserId || toIdString(recipientUserId) === toIdString(actorUserId)) {
    return null;
  }

  const notificationFilter = {
    userId: recipientUserId,
    actorUserId,
    type,
    ...(postId ? { postId } : {}),
    ...(commentId ? { commentId } : {})
  };

  await Notification.deleteMany(notificationFilter);

  if (!active) {
    publishToUser(toIdString(recipientUserId), {
      type: "notifications.updated",
      postId: toIdString(postId),
      commentId: toIdString(commentId),
      notificationType: type
    });

    return null;
  }

  return createNotificationIfAllowed({
    recipientUserId,
    actorUserId,
    type,
    postId,
    commentId,
    title,
    text
  });
}

export async function createPost({
  currentUserId,
  clientRequestId = "",
  content = "",
  image = "",
  voiceNote = null
}) {
  const currentUser = await requireCurrentUser(currentUserId);
  const safePost = validatePostSubmission({
    content,
    voiceNote
  });
  const safeImageUrl = validateImageUrl(image);
  const normalizedVoiceNote = normalizeVoiceNoteInput(safePost.voiceNote);
  const safeClientRequestId = normalizeClientRequestId(clientRequestId);
  const safePostPayload = {
    content: safePost.content,
    imageUrl: safeImageUrl,
    voiceNote: normalizedVoiceNote
  };

  if (safeClientRequestId) {
    const existingRequestPost = await Post.findOne({
      userId: currentUser._id,
      clientRequestId: safeClientRequestId
    });

    if (existingRequestPost) {
      if (!isSamePostPayload(existingRequestPost, safePostPayload)) {
        throw new AppError("That post request has already been used.", {
          statusCode: 409,
          code: "POST_REQUEST_ID_REUSED",
          field: "clientRequestId"
        });
      }

      return serializeSinglePost(existingRequestPost);
    }
  }

  const duplicatePost = await findRecentDuplicatePost({
    userId: currentUser._id,
    safePost: safePostPayload
  });

  if (duplicatePost) {
    return serializeSinglePost(duplicatePost);
  }

  if (normalizedVoiceNote) {
    await assertVoiceNoteCreationAllowed(currentUser._id);
  }

  let post;

  try {
    post = await Post.create({
      userId: currentUser._id,
      clientRequestId: safeClientRequestId || null,
      content: safePost.content,
      imageUrl: safeImageUrl,
      voiceNote: normalizedVoiceNote,
      location: {
        township: currentUser.location.township,
        extension: currentUser.location.extension
      }
    });
  } catch (error) {
    if (safeClientRequestId && isClientRequestIdDuplicateError(error)) {
      const existingRequestPost = await Post.findOne({
        userId: currentUser._id,
        clientRequestId: safeClientRequestId
      });

      if (existingRequestPost) {
        if (!isSamePostPayload(existingRequestPost, safePostPayload)) {
          throw new AppError("That post request has already been used.", {
            statusCode: 409,
            code: "POST_REQUEST_ID_REUSED",
            field: "clientRequestId"
          });
        }

        return serializeSinglePost(existingRequestPost);
      }
    }

    throw error;
  }

  publishToAll({
    type: "posts.updated",
    postId: toIdString(post._id),
    reason: "post.created"
  });

  return serializeSinglePost(post);
}

export async function getFeedPosts({ limit } = {}) {
  const query = Post.find({ status: "active" }).sort({ createdAt: -1 });

  if (Number.isInteger(limit) && limit > 0) {
    query.limit(limit);
  }

  const posts = await query;
  return serializePosts(posts);
}

export async function searchPosts({ query, limit } = {}) {
  const normalizedQuery = String(query ?? "").trim();

  if (!normalizedQuery) {
    return [];
  }

  const safeRegex = new RegExp(escapeRegex(normalizedQuery), "i");
  const matchingUsers = await User.find({
    $or: [
      { username: { $regex: safeRegex } },
      { "location.township": { $regex: safeRegex } },
      { "location.extension": { $regex: safeRegex } }
    ]
  })
    .select("_id")
    .lean();
  const matchingUserIds = matchingUsers.map((user) => user._id);
  const postQuery = Post.find({
    status: "active",
    $or: [
      { content: { $regex: safeRegex } },
      { "location.township": { $regex: safeRegex } },
      { "location.extension": { $regex: safeRegex } },
      ...(matchingUserIds.length > 0 ? [{ userId: { $in: matchingUserIds } }] : [])
    ]
  }).sort({ createdAt: -1 });

  if (Number.isInteger(limit) && limit > 0) {
    postQuery.limit(limit);
  }

  const posts = await postQuery;
  return serializePosts(posts);
}

export async function getPost(postId) {
  const post = await requireActivePost(postId);
  return serializeSinglePost(post);
}

export async function getPostsByUser({ userId, limit } = {}) {
  assertObjectId(userId, "userId");

  const query = Post.find({
    userId,
    status: "active"
  }).sort({ createdAt: -1 });

  if (Number.isInteger(limit) && limit > 0) {
    query.limit(limit);
  }

  const posts = await query;
  return serializePosts(posts);
}

export async function updatePost({
  currentUserId,
  postId,
  content,
  image
}) {
  const post = await requireActivePost(postId);

  if (toIdString(post.userId) !== toIdString(currentUserId)) {
    throw new AppError("You can only edit your own post.", {
      statusCode: 403,
      code: "POST_EDIT_FORBIDDEN"
    });
  }

  if (hasVoiceNoteContent(post.voiceNote)) {
    throw new AppError("Voice-note posts cannot be edited. Delete and repost instead.", {
      statusCode: 400,
      code: "POST_EDIT_VOICE_NOTE_FORBIDDEN"
    });
  }

  post.content = validatePostContent(content);

  if (image !== undefined) {
    post.imageUrl = validateImageUrl(image);
  }

  await post.save();

  publishToAll({
    type: "posts.updated",
    postId: toIdString(post._id),
    reason: "post.updated"
  });

  return serializeSinglePost(post);
}

export async function deletePost({ currentUserId, postId }) {
  const post = await requireActivePost(postId);

  if (toIdString(post.userId) !== toIdString(currentUserId)) {
    throw new AppError("You can only delete your own post.", {
      statusCode: 403,
      code: "POST_DELETE_FORBIDDEN"
    });
  }

  await Promise.all([
    Comment.deleteMany({ postId: post._id }),
    Notification.deleteMany({ postId: post._id }),
    Post.deleteOne({ _id: post._id })
  ]);

  publishToAll({
    type: "posts.updated",
    postId: toIdString(post._id),
    reason: "post.deleted"
  });

  return true;
}

export async function setPostReaction({
  currentUserId,
  postId,
  reactionType
}) {
  const post = await requireActivePost(postId);
  const safeReactionType = validateReactionType(reactionType);
  const reactionIsActive = updateReactionArray(post.reactions, safeReactionType, currentUserId);

  await post.save({ timestamps: false });
  await syncReactionNotification({
    recipientUserId: post.userId,
    actorUserId: currentUserId,
    type: "post_reaction",
    postId: post._id,
    title: "Post reaction",
    text:
      safeReactionType === "dislike"
        ? "Disliked your post."
        : "Liked your post.",
      active: reactionIsActive
    });

  publishToAll({
    type: "posts.updated",
    postId: toIdString(post._id),
    reason: "post.reaction"
  });

  return serializeSinglePost(post);
}

export async function getCommentsForPost(postId) {
  await requireActivePost(postId);

  const comments = await Comment.find({
    postId,
    status: "active"
  }).sort({ createdAt: 1 });

  return serializeComments(comments);
}

export async function addCommentToPost({
  currentUserId,
  postId,
  parentId = null,
  content,
  voiceNote = null
}) {
  const post = await requireActivePost(postId);
  const safeComment = validateCommentSubmission({
    content,
    voiceNote
  });
  let parentComment = null;

  if (hasVoiceNoteContent(safeComment.voiceNote)) {
    await assertVoiceNoteCreationAllowed(currentUserId);
  }

  if (parentId !== null) {
    parentComment = await requireActiveComment(postId, parentId);
  }

  const comment = await Comment.create({
    postId: post._id,
    userId: currentUserId,
    parentId: parentComment?._id || null,
    content: safeComment.content,
    voiceNote: normalizeVoiceNoteInput(safeComment.voiceNote)
  });

  post.commentCount = Math.max(0, Number(post.commentCount || 0) + 1);
  await post.save({ timestamps: false });

  if (parentComment) {
    await createNotificationIfAllowed({
      recipientUserId: parentComment.userId,
      actorUserId: currentUserId,
      type: "comment_reply",
      postId: post._id,
      commentId: comment._id,
      title: "New reply"
    });
  } else {
    await createNotificationIfAllowed({
      recipientUserId: post.userId,
      actorUserId: currentUserId,
      type: "post_comment",
      postId: post._id,
      commentId: comment._id,
      title: "New comment"
    });
  }

  const serializedComments = await serializeComments([comment]);

  publishToAll({
    type: "posts.updated",
    postId: toIdString(post._id),
    commentId: toIdString(comment._id),
    reason: "comment.created"
  });

  return serializedComments[0] || null;
}

export async function updateCommentInPost({
  currentUserId,
  postId,
  commentId,
  content
}) {
  await requireActivePost(postId);
  const comment = await requireActiveComment(postId, commentId);

  if (toIdString(comment.userId) !== toIdString(currentUserId)) {
    throw new AppError("You can only edit your own comment.", {
      statusCode: 403,
      code: "COMMENT_EDIT_FORBIDDEN"
    });
  }

  if (hasVoiceNoteContent(comment.voiceNote)) {
    throw new AppError("Voice-note comments cannot be edited.", {
      statusCode: 400,
      code: "COMMENT_EDIT_VOICE_NOTE_FORBIDDEN"
    });
  }

  comment.content = validateCommentContent(content);
  await comment.save();

  const serializedComments = await serializeComments([comment]);

  publishToAll({
    type: "posts.updated",
    postId: toIdString(comment.postId),
    commentId: toIdString(comment._id),
    reason: "comment.updated"
  });

  return serializedComments[0] || null;
}

export async function deleteCommentFromPost({
  currentUserId,
  postId,
  commentId
}) {
  const post = await requireActivePost(postId);
  const comment = await requireActiveComment(postId, commentId);

  if (toIdString(comment.userId) !== toIdString(currentUserId)) {
    throw new AppError("You can only delete your own comment.", {
      statusCode: 403,
      code: "COMMENT_DELETE_FORBIDDEN"
    });
  }

  const comments = await Comment.find({
    postId: post._id,
    status: "active"
  })
    .select("_id parentId");
  const commentIdsToDelete = Array.from(collectCommentBranchIds(comments, comment._id));

  await Promise.all([
    Comment.deleteMany({ _id: { $in: commentIdsToDelete } }),
    Notification.deleteMany({ commentId: { $in: commentIdsToDelete } })
  ]);

  post.commentCount = Math.max(0, Number(post.commentCount || 0) - commentIdsToDelete.length);
  await post.save({ timestamps: false });

  publishToAll({
    type: "posts.updated",
    postId: toIdString(post._id),
    commentId: toIdString(comment._id),
    reason: "comment.deleted"
  });

  return true;
}

export async function setCommentReaction({
  currentUserId,
  postId,
  commentId,
  reactionType
}) {
  await requireActivePost(postId);
  const comment = await requireActiveComment(postId, commentId);
  const safeReactionType = validateReactionType(reactionType);
  const reactionIsActive = updateReactionArray(comment.reactions, safeReactionType, currentUserId);

  await comment.save({ timestamps: false });
  await syncReactionNotification({
    recipientUserId: comment.userId,
    actorUserId: currentUserId,
    type: "comment_reaction",
    postId: comment.postId,
    commentId: comment._id,
    title: "Comment reaction",
    text:
      safeReactionType === "dislike"
        ? "Disliked your comment."
        : "Liked your comment.",
      active: reactionIsActive
    });

  const serializedComments = await serializeComments([comment]);

  publishToAll({
    type: "posts.updated",
    postId: toIdString(comment.postId),
    commentId: toIdString(comment._id),
    reason: "comment.reaction"
  });

  return serializedComments[0] || null;
}
