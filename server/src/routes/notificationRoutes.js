import { Router } from "express";
import {
  getNotificationsHandler,
  markAllNotificationsReadHandler,
  markConversationNotificationsReadHandler,
  markNotificationReadHandler
} from "../controllers/notificationController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.get("/", getNotificationsHandler);
router.patch("/read-all", markAllNotificationsReadHandler);
router.patch(
  "/conversations/:conversationId/read",
  markConversationNotificationsReadHandler
);
router.patch("/:notificationId/read", markNotificationReadHandler);

export default router;
