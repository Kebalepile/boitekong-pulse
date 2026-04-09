import { Router } from "express";
import {
  block,
  follow,
  getDmAvailability,
  unblock,
  unfollow,
  updateDirectMessagesSetting,
  updateNotificationsSetting,
  updateProfile
} from "../controllers/userController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.patch("/me/profile", updateProfile);
router.patch("/me/settings/direct-messages", updateDirectMessagesSetting);
router.patch("/me/settings/notifications", updateNotificationsSetting);
router.get("/:userId/dm-availability", getDmAvailability);
router.post("/:userId/follow", follow);
router.delete("/:userId/follow", unfollow);
router.post("/:userId/block", block);
router.delete("/:userId/block", unblock);

export default router;
