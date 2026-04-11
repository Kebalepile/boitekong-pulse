import {
  addCommentToPost,
  createPost,
  deleteCommentFromPost,
  deletePost,
  getCommentsForPost,
  getFeedPosts,
  getPost,
  getPostsByUser,
  searchPosts,
  setCommentReaction,
  setPostReaction,
  updateCommentInPost,
  updatePost
} from "../services/postService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed;
}

export const createPostHandler = asyncHandler(async (req, res) => {
  const post = await createPost({
    currentUserId: req.user._id,
    content: req.body.content,
    image: req.body.image || req.body.imageUrl || "",
    voiceNote: req.body.voiceNote || null
  });

  res.status(201).json({
    message: "Post created.",
    post
  });
});

export const getFeedHandler = asyncHandler(async (req, res) => {
  const posts = await getFeedPosts({
    limit: parseLimit(req.query.limit)
  });

  res.status(200).json({ posts });
});

export const searchPostsHandler = asyncHandler(async (req, res) => {
  const posts = await searchPosts({
    query: req.query.query,
    limit: parseLimit(req.query.limit)
  });

  res.status(200).json({ posts });
});

export const getPostHandler = asyncHandler(async (req, res) => {
  const post = await getPost(req.params.postId);
  res.status(200).json({ post });
});

export const getPostsByUserHandler = asyncHandler(async (req, res) => {
  const posts = await getPostsByUser({
    userId: req.params.userId,
    limit: parseLimit(req.query.limit)
  });

  res.status(200).json({ posts });
});

export const updatePostHandler = asyncHandler(async (req, res) => {
  const post = await updatePost({
    currentUserId: req.user._id,
    postId: req.params.postId,
    content: req.body.content,
    image: req.body.image ?? req.body.imageUrl
  });

  res.status(200).json({
    message: "Post updated.",
    post
  });
});

export const deletePostHandler = asyncHandler(async (req, res) => {
  await deletePost({
    currentUserId: req.user._id,
    postId: req.params.postId
  });

  res.status(200).json({
    message: "Post deleted."
  });
});

export const setPostReactionHandler = asyncHandler(async (req, res) => {
  const post = await setPostReaction({
    currentUserId: req.user._id,
    postId: req.params.postId,
    reactionType: req.body.reactionType
  });

  res.status(200).json({
    message: "Post reaction updated.",
    post
  });
});

export const getCommentsForPostHandler = asyncHandler(async (req, res) => {
  const comments = await getCommentsForPost(req.params.postId);
  res.status(200).json({ comments });
});

export const addCommentHandler = asyncHandler(async (req, res) => {
  const comment = await addCommentToPost({
    currentUserId: req.user._id,
    postId: req.params.postId,
    parentId: req.body.parentId ?? null,
    content: req.body.content,
    voiceNote: req.body.voiceNote || null
  });

  res.status(201).json({
    message: "Comment added.",
    comment
  });
});

export const updateCommentHandler = asyncHandler(async (req, res) => {
  const comment = await updateCommentInPost({
    currentUserId: req.user._id,
    postId: req.params.postId,
    commentId: req.params.commentId,
    content: req.body.content
  });

  res.status(200).json({
    message: "Comment updated.",
    comment
  });
});

export const deleteCommentHandler = asyncHandler(async (req, res) => {
  await deleteCommentFromPost({
    currentUserId: req.user._id,
    postId: req.params.postId,
    commentId: req.params.commentId
  });

  res.status(200).json({
    message: "Comment deleted."
  });
});

export const setCommentReactionHandler = asyncHandler(async (req, res) => {
  const comment = await setCommentReaction({
    currentUserId: req.user._id,
    postId: req.params.postId,
    commentId: req.params.commentId,
    reactionType: req.body.reactionType
  });

  res.status(200).json({
    message: "Comment reaction updated.",
    comment
  });
});
