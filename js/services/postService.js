import { storage } from "../storage/storage.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { createPost } from "../models/postModel.js";
import { createComment } from "../models/commentModel.js";
import { createNotification } from "./notificationService.js";
import { areNotificationsEnabled } from "./userService.js";
import { getHiddenTargetIdsForUser } from "./reportService.js";
import {
  validatePostContent,
  validatePostSubmission,
  validateImageUrl,
  validateTownship,
  validateExtension
} from "../utils/validators.js";

const ALLOWED_REACTIONS = ["like", "dislike"];
const REACTION_KEYS = ["like", "meh", "dislike"];

function makeError(code, field, message) {
  const error = new Error(message);
  error.code = code;
  error.field = field;
  return error;
}

export function getPosts() {
  const posts = storage.get(STORAGE_KEYS.POSTS, []);
  return posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function filterVisiblePostsForUser(posts, userId) {
  const safePosts = Array.isArray(posts) ? posts : [];
  const hiddenPostIds = getHiddenTargetIdsForUser({
    userId,
    targetType: "post"
  });

  if (hiddenPostIds.size === 0) {
    return safePosts;
  }

  return safePosts.filter((post) => !hiddenPostIds.has(post.id));
}

export function getVisiblePosts(userId) {
  return filterVisiblePostsForUser(getPosts(), userId);
}

export function getVisiblePostsByUserId(userId, viewerUserId) {
  return filterVisiblePostsForUser(getPostsByUserId(userId), viewerUserId);
}

export function savePosts(posts) {
  storage.set(STORAGE_KEYS.POSTS, posts);
}

export function createAndStorePost({ userId, content = "", image = "", location, voiceNote = null }) {
  const safePost = validatePostSubmission({
    content,
    voiceNote
  });
  const post = createPost({
    userId,
    content: safePost.content,
    image,
    location,
    voiceNote: safePost.voiceNote
  });
  const posts = storage.get(STORAGE_KEYS.POSTS, []);

  posts.push(post);
  savePosts(posts);

  return post;
}

export function getPostById(postId) {
  const posts = storage.get(STORAGE_KEYS.POSTS, []);
  return posts.find((post) => post.id === postId) || null;
}

export function getPostsByUserId(userId) {
  return getPosts().filter((post) => post.userId === userId);
}

export function updatePost({
  postId,
  userId,
  content,
  image = "",
  location
}) {
  const posts = storage.get(STORAGE_KEYS.POSTS, []);
  const postIndex = posts.findIndex((post) => post.id === postId);

  if (postIndex === -1) {
    throw makeError("POST_NOT_FOUND", null, "Post not found.");
  }

  const existingPost = posts[postIndex];

  if (existingPost.userId !== userId) {
    throw makeError("POST_EDIT_FORBIDDEN", null, "You can only edit your own post.");
  }

  const updatedPost = {
    ...existingPost,
    content: validatePostContent(content),
    image: validateImageUrl(image),
    location: {
      township: validateTownship(location.township),
      extension: validateExtension(location.extension)
    },
    updatedAt: new Date().toISOString()
  };

  posts[postIndex] = updatedPost;
  savePosts(posts);

  return updatedPost;
}

export function deletePost({ postId, userId }) {
  const posts = storage.get(STORAGE_KEYS.POSTS, []);
  const targetPost = posts.find((post) => post.id === postId);

  if (!targetPost) {
    throw makeError("POST_NOT_FOUND", null, "Post not found.");
  }

  if (targetPost.userId !== userId) {
    throw makeError("POST_DELETE_FORBIDDEN", null, "You can only delete your own post.");
  }

  const nextPosts = posts.filter((post) => post.id !== postId);
  savePosts(nextPosts);

  return true;
}

export function addCommentToPost({
  postId,
  userId,
  parentId = null,
  content,
  voiceNote = null
}) {
  const posts = storage.get(STORAGE_KEYS.POSTS, []);
  const postIndex = posts.findIndex((post) => post.id === postId);

  if (postIndex === -1) {
    throw makeError("POST_NOT_FOUND", null, "Post not found.");
  }

  const post = posts[postIndex];
  const comments = Array.isArray(post.comments) ? [...post.comments] : [];
  const parentComment =
    parentId !== null ? comments.find((comment) => comment.id === parentId) || null : null;

  if (parentId !== null) {
    if (!parentComment) {
      throw makeError("COMMENT_PARENT_NOT_FOUND", null, "Parent comment not found.");
    }
  }

  const comment = createComment({
    postId,
    userId,
    parentId,
    content,
    voiceNote
  });

  posts[postIndex] = {
    ...post,
    comments: [...comments, comment]
  };

  savePosts(posts);

  if (parentComment) {
    if (parentComment.userId !== userId && areNotificationsEnabled(parentComment.userId)) {
      createNotification({
        userId: parentComment.userId,
        type: "comment_reply",
        actorUserId: userId,
        postId,
        commentId: comment.id,
        title: "New reply",
        text: ""
      });
    }
  } else if (post.userId !== userId && areNotificationsEnabled(post.userId)) {
    createNotification({
      userId: post.userId,
      type: "post_comment",
      actorUserId: userId,
      postId,
      commentId: comment.id,
      title: "New comment",
      text: ""
    });
  }

  return comment;
}

export function updateCommentInPost({ postId, commentId, userId, content }) {
  const posts = storage.get(STORAGE_KEYS.POSTS, []);
  const postIndex = posts.findIndex((post) => post.id === postId);

  if (postIndex === -1) {
    throw makeError("POST_NOT_FOUND", null, "Post not found.");
  }

  const post = posts[postIndex];
  const comments = Array.isArray(post.comments) ? [...post.comments] : [];
  const commentIndex = comments.findIndex((comment) => comment.id === commentId);

  if (commentIndex === -1) {
    throw makeError("COMMENT_NOT_FOUND", null, "Comment not found.");
  }

  const existingComment = comments[commentIndex];

  if (existingComment.userId !== userId) {
    throw makeError(
      "COMMENT_EDIT_FORBIDDEN",
      null,
      "You can only edit your own comment."
    );
  }

  comments[commentIndex] = {
    ...existingComment,
    content: validatePostContent(content),
    updatedAt: new Date().toISOString()
  };

  posts[postIndex] = {
    ...post,
    comments
  };

  savePosts(posts);
  return comments[commentIndex];
}

export function deleteCommentFromPost({ postId, commentId, userId }) {
  const posts = storage.get(STORAGE_KEYS.POSTS, []);
  const postIndex = posts.findIndex((post) => post.id === postId);

  if (postIndex === -1) {
    throw makeError("POST_NOT_FOUND", null, "Post not found.");
  }

  const post = posts[postIndex];
  const comments = Array.isArray(post.comments) ? [...post.comments] : [];
  const targetComment = comments.find((comment) => comment.id === commentId);

  if (!targetComment) {
    throw makeError("COMMENT_NOT_FOUND", null, "Comment not found.");
  }

  if (targetComment.userId !== userId) {
    throw makeError(
      "COMMENT_DELETE_FORBIDDEN",
      null,
      "You can only delete your own comment."
    );
  }

  const commentIdsToDelete = collectCommentBranchIds(comments, commentId);

  posts[postIndex] = {
    ...post,
    comments: comments.filter((comment) => !commentIdsToDelete.has(comment.id))
  };

  savePosts(posts);
  return true;
}

export function getCommentsForPost(postOrId) {
  const postId = typeof postOrId === "string" ? postOrId : postOrId?.id;

  if (!postId) {
    return [];
  }

  const post = getPostById(postId);
  if (!post) return [];
  return Array.isArray(post.comments) ? post.comments : [];
}

export function getVisibleCommentsForPost(postOrId, userId) {
  const comments = getCommentsForPost(postOrId);
  const hiddenCommentIds = getHiddenTargetIdsForUser({
    userId,
    targetType: "comment"
  });

  if (hiddenCommentIds.size === 0) {
    return comments;
  }

  const hiddenBranchIds = new Set();
  let foundNewChild = true;

  comments.forEach((comment) => {
    if (hiddenCommentIds.has(comment.id)) {
      hiddenBranchIds.add(comment.id);
    }
  });

  while (foundNewChild) {
    foundNewChild = false;

    comments.forEach((comment) => {
      if (
        comment.parentId &&
        hiddenBranchIds.has(comment.parentId) &&
        !hiddenBranchIds.has(comment.id)
      ) {
        hiddenBranchIds.add(comment.id);
        foundNewChild = true;
      }
    });
  }

  return comments.filter((comment) => !hiddenBranchIds.has(comment.id));
}

export function setPostReaction({ postId, userId, reactionType }) {
  if (!ALLOWED_REACTIONS.includes(reactionType)) {
    throw makeError("REACTION_INVALID", null, "Invalid reaction type.");
  }

  const posts = storage.get(STORAGE_KEYS.POSTS, []);
  const postIndex = posts.findIndex((post) => post.id === postId);

  if (postIndex === -1) {
    throw makeError("POST_NOT_FOUND", null, "Post not found.");
  }

  const post = posts[postIndex];
  const reactions = createReactionRecord(post.reactions);

  const alreadyActive = reactions[reactionType].includes(userId);

  REACTION_KEYS.forEach((type) => {
    reactions[type] = reactions[type].filter((id) => id !== userId);
  });

  if (!alreadyActive) {
    reactions[reactionType].push(userId);
  }

  posts[postIndex] = {
    ...post,
    reactions
  };

  savePosts(posts);
  return posts[postIndex];
}

export function setCommentReaction({ postId, commentId, userId, reactionType }) {
  if (!ALLOWED_REACTIONS.includes(reactionType)) {
    throw makeError("REACTION_INVALID", null, "Invalid reaction type.");
  }

  const posts = storage.get(STORAGE_KEYS.POSTS, []);
  const postIndex = posts.findIndex((post) => post.id === postId);

  if (postIndex === -1) {
    throw makeError("POST_NOT_FOUND", null, "Post not found.");
  }

  const post = posts[postIndex];
  const comments = Array.isArray(post.comments) ? [...post.comments] : [];
  const commentIndex = comments.findIndex((comment) => comment.id === commentId);

  if (commentIndex === -1) {
    throw makeError("COMMENT_NOT_FOUND", null, "Comment not found.");
  }

  const comment = comments[commentIndex];
  const reactions = createReactionRecord(comment.reactions);
  const alreadyActive = reactions[reactionType].includes(userId);

  REACTION_KEYS.forEach((type) => {
    reactions[type] = reactions[type].filter((id) => id !== userId);
  });

  if (!alreadyActive) {
    reactions[reactionType].push(userId);
  }

  comments[commentIndex] = {
    ...comment,
    reactions
  };

  posts[postIndex] = {
    ...post,
    comments
  };

  savePosts(posts);
  return comments[commentIndex];
}

export function getUserReaction(post, userId) {
  return getActiveReaction(post, userId);
}

export function getCommentUserReaction(comment, userId) {
  return getActiveReaction(comment, userId);
}

function collectCommentBranchIds(comments, rootCommentId) {
  const ids = new Set([rootCommentId]);
  let foundNewChild = true;

  while (foundNewChild) {
    foundNewChild = false;

    comments.forEach((comment) => {
      if (comment.parentId && ids.has(comment.parentId) && !ids.has(comment.id)) {
        ids.add(comment.id);
        foundNewChild = true;
      }
    });
  }

  return ids;
}

function createReactionRecord(reactions = {}) {
  return {
    like: Array.isArray(reactions.like) ? [...reactions.like] : [],
    meh: Array.isArray(reactions.meh) ? [...reactions.meh] : [],
    dislike: Array.isArray(reactions.dislike) ? [...reactions.dislike] : []
  };
}

function getActiveReaction(entity, userId) {
  if (!entity?.reactions || !userId) {
    return null;
  }

  if (entity.reactions.like?.includes(userId)) return "like";
  if (entity.reactions.dislike?.includes(userId)) return "dislike";

  return null;
}
