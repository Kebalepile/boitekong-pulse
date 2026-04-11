import {
  getNotificationsForUser,
  markAllNotificationsRead,
  markConversationNotificationsRead,
  markNotificationRead
} from "../services/notificationService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed;
}

export const getNotificationsHandler = asyncHandler(async (req, res) => {
  const notifications = await getNotificationsForUser(req.user._id, {
    limit: parseLimit(req.query.limit)
  });

  res.status(200).json({
    notifications
  });
});

export const markNotificationReadHandler = asyncHandler(async (req, res) => {
  const notification = await markNotificationRead({
    currentUserId: req.user._id,
    notificationId: req.params.notificationId
  });

  res.status(200).json({
    message: "Notification marked as read.",
    notification
  });
});

export const markConversationNotificationsReadHandler = asyncHandler(async (req, res) => {
  const result = await markConversationNotificationsRead({
    currentUserId: req.user._id,
    conversationId: req.params.conversationId
  });

  res.status(200).json({
    message: "Conversation notifications marked as read.",
    ...result
  });
});

export const markAllNotificationsReadHandler = asyncHandler(async (req, res) => {
  const result = await markAllNotificationsRead(req.user._id);

  res.status(200).json({
    message: "All notifications marked as read.",
    ...result
  });
});
