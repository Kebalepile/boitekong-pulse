import { Router } from "express";
import {
  block,
  follow,
  getFollowers,
  getFollowing,
  getDmAvailability,
  getUser,
  search,
  unblock,
  unfollow,
  updateDirectMessageEncryptionKeyHandler,
  updateDirectMessagesSetting,
  updateNotificationsSetting,
  updateProfile
} from "../controllers/userController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.patch("/me/profile", updateProfile);
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
