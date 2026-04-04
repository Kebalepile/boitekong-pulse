import { storage } from "../storage/storage.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { createPost } from "../models/postModel.js";

const ALLOWED_REACTIONS = ["like", "meh", "dislike"];

export function getPosts() {
  const posts = storage.get(STORAGE_KEYS.POSTS, []);
  return posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function savePosts(posts) {
  storage.set(STORAGE_KEYS.POSTS, posts);
}

export function createAndStorePost({ userId, content, image = "", location }) {
  const post = createPost({ userId, content, image, location });
  const posts = storage.get(STORAGE_KEYS.POSTS, []);

  posts.push(post);
  savePosts(posts);

  return post;
}

export function getPostsByUserId(userId) {
  return getPosts().filter((post) => post.userId === userId);
}

export function setPostReaction({ postId, userId, reactionType }) {
  if (!ALLOWED_REACTIONS.includes(reactionType)) {
    throw new Error("Invalid reaction type.");
  }

  const posts = storage.get(STORAGE_KEYS.POSTS, []);
  const postIndex = posts.findIndex((post) => post.id === postId);

  if (postIndex === -1) {
    throw new Error("Post not found.");
  }

  const post = posts[postIndex];
  const reactions = {
    like: Array.isArray(post.reactions?.like) ? [...post.reactions.like] : [],
    meh: Array.isArray(post.reactions?.meh) ? [...post.reactions.meh] : [],
    dislike: Array.isArray(post.reactions?.dislike) ? [...post.reactions.dislike] : []
  };

  const alreadyActive = reactions[reactionType].includes(userId);

  ALLOWED_REACTIONS.forEach((type) => {
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

export function getUserReaction(post, userId) {
  if (!post?.reactions || !userId) {
    return null;
  }

  if (post.reactions.like?.includes(userId)) return "like";
  if (post.reactions.meh?.includes(userId)) return "meh";
  if (post.reactions.dislike?.includes(userId)) return "dislike";

  return null;
}