import { Router } from "express";
import {
  archiveAllConversationsHandler,
  archiveSelectedConversationsHandler,
  deleteMessageHandler,
  getConversation,
  getConversations,
  getOrCreateDirectConversation,
  markConversationReadHandler,
  sendMessageHandler,
  updateMessageHandler
} from "../controllers/conversationController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.get("/", getConversations);
router.post("/archive", archiveSelectedConversationsHandler);
router.post("/archive-all", archiveAllConversationsHandler);
router.post("/direct/:userId", getOrCreateDirectConversation);
router.get("/:conversationId", getConversation);
router.post("/:conversationId/read", markConversationReadHandler);
router.post("/:conversationId/messages", sendMessageHandler);
router.patch("/:conversationId/messages/:messageId", updateMessageHandler);
router.delete("/:conversationId/messages/:messageId", deleteMessageHandler);

export default router;
