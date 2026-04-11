import { Router } from "express";
import {
  addCommentHandler,
  createPostHandler,
  deleteCommentHandler,
  deletePostHandler,
  getCommentsForPostHandler,
  getFeedHandler,
  getPostHandler,
  getPostsByUserHandler,
  searchPostsHandler,
  setCommentReactionHandler,
  setPostReactionHandler,
  updateCommentHandler,
  updatePostHandler
} from "../controllers/postController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.post("/", createPostHandler);
router.get("/feed", getFeedHandler);
router.get("/search", searchPostsHandler);
router.get("/user/:userId", getPostsByUserHandler);
router.get("/:postId", getPostHandler);
router.patch("/:postId", updatePostHandler);
router.delete("/:postId", deletePostHandler);
router.post("/:postId/reactions", setPostReactionHandler);
router.get("/:postId/comments", getCommentsForPostHandler);
router.post("/:postId/comments", addCommentHandler);
router.patch("/:postId/comments/:commentId", updateCommentHandler);
router.delete("/:postId/comments/:commentId", deleteCommentHandler);
router.post("/:postId/comments/:commentId/reactions", setCommentReactionHandler);

export default router;
