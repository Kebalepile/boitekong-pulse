import express, { Router } from "express";
import {
  block,
  deleteAvatar,
  follow,
  getFollowers,
  getFollowing,
  getDmAvailability,
  getUser,
  search,
  unblock,
  unfollow,
  uploadAvatar,
  updateDirectMessageEncryptionKeyHandler,
  updateDirectMessagesSetting,
  updateNotificationsSetting,
  updateProfile
} from "../controllers/userController.js";
import { requireAuth } from "../middleware/auth.js";
import { AVATAR_UPLOAD_LIMIT_BYTES } from "../utils/avatarUploads.js";

const router = Router();

router.use(requireAuth);

router.patch("/me/profile", updateProfile);
router.put(
  "/me/avatar",
  express.raw({
    type: ["image/png", "image/jpeg", "image/webp"],
    limit: AVATAR_UPLOAD_LIMIT_BYTES
  }),
  uploadAvatar
);
router.delete("/me/avatar", deleteAvatar);
router.put("/me/direct-message-key", updateDirectMessageEncryptionKeyHandler);
router.patch("/me/settings/direct-messages", updateDirectMessagesSetting);
router.patch("/me/settings/notifications", updateNotificationsSetting);
router.get("/search", search);
router.get("/:userId/followers", getFollowers);
router.get("/:userId/following", getFollowing);
router.get("/:userId/dm-availability", getDmAvailability);
router.get("/:userId", getUser);
router.post("/:userId/follow", follow);
router.delete("/:userId/follow", unfollow);
router.post("/:userId/block", block);
router.delete("/:userId/block", unblock);

export default router;
