import mongoose from "mongoose";
import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/appError.js";
import { publishToUser } from "./realtimeService.js";

function makeObjectIdError(field, message) {
  return new AppError(message, {
    statusCode: 400,
    code: "OBJECT_ID_INVALID",
    field
  });
}

function assertObjectId(value, field) {
  if (!mongoose.isValidObjectId(value)) {
    throw makeObjectIdError(field, `${field} is invalid.`);
  }
}

function toIdString(value) {
  return value ? String(value) : "";
}

function serializeUserPreview(user) {
  if (!user) {
    return null;
  }

  return {
    id: toIdString(user._id),
    username: user.username,
    phoneNumber: user.phoneNumber || "",
    avatarUrl: user.avatarUrl || "",
    avatarDataUrl: user.avatarUrl || "",
    location: {
      province: user.location?.province || "",
      municipality: user.location?.municipality || "",
      township: user.location?.township || "",
      extension: user.location?.extension || user.location?.area || "",
      area: user.location?.area || user.location?.extension || "",
      streetName: ""
    },
    directMessagesEnabled: user.directMessagesEnabled !== false,
    notificationsEnabled: user.notificationsEnabled !== false,
    blockedUserIds: Array.isArray(user.blockedUserIds)
      ? user.blockedUserIds.map((value) => toIdString(value))
      : [],
    followingUserIds: Array.isArray(user.followingUserIds)
      ? user.followingUserIds.map((value) => toIdString(value))
      : [],
    phoneVerified: user.phoneVerified === true,
    lastSeen: user.lastSeen,
    roles: Array.isArray(user.roles) ? user.roles : ["user"],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

async function loadActorsMap(actorUserIds) {
  const uniqueActorIds = Array.from(new Set(actorUserIds.filter(Boolean)));

  if (uniqueActorIds.length === 0) {
    return new Map();
  }

  const users = await User.find({
    _id: { $in: uniqueActorIds }
  }).lean();

  return new Map(users.map((user) => [toIdString(user._id), user]));
}

function serializeNotification(notification, actorsById = new Map()) {
  const actorUserId = toIdString(notification.actorUserId);

  return {
    id: toIdString(notification._id),
    userId: toIdString(notification.userId),
    actorUserId,
    actorUser: serializeUserPreview(actorsById.get(actorUserId) || null),
    type: notification.type || "system",
    postId: toIdString(notification.postId),
    commentId: toIdString(notification.commentId),
    conversationId: toIdString(notification.conversationId),
    messageId: toIdString(notification.messageId),
    title: notification.title || "",
    text: notification.text || "",
    read: notification.read === true,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt
  };
}

async function serializeNotifications(notifications) {
  const safeNotifications = notifications.map((notification) =>
    typeof notification.toObject === "function" ? notification.toObject() : notification
  );
  const actorsById = await loadActorsMap(
    safeNotifications.map((notification) => toIdString(notification.actorUserId))
  );

  return safeNotifications.map((notification) =>
    serializeNotification(notification, actorsById)
  );
}

async function requireNotificationForUser(notificationId, currentUserId) {
  assertObjectId(notificationId, "notificationId");

  const notification = await Notification.findOne({
    _id: notificationId,
    userId: currentUserId
  });

  if (!notification) {
    throw new AppError("Notification not found.", {
      statusCode: 404,
      code: "NOTIFICATION_NOT_FOUND"
    });
  }

  return notification;
}

export async function getNotificationsForUser(currentUserId, { limit } = {}) {
  assertObjectId(currentUserId, "userId");

  const query = Notification.find({
    userId: currentUserId
  }).sort({ createdAt: -1 });

  if (Number.isInteger(limit) && limit > 0) {
    query.limit(limit);
  }

  const notifications = await query;
  return serializeNotifications(notifications);
}

export async function markNotificationRead({ currentUserId, notificationId }) {
  const notification = await requireNotificationForUser(notificationId, currentUserId);

  if (!notification.read) {
    notification.read = true;
    await notification.save();
    publishToUser(toIdString(currentUserId), {
      type: "notifications.updated",
      notificationType: notification.type || "system"
    });
  }

  const [serializedNotification] = await serializeNotifications([notification]);
  return serializedNotification || null;
}

export async function markConversationNotificationsRead({
  currentUserId,
  conversationId
}) {
  assertObjectId(currentUserId, "userId");
  assertObjectId(conversationId, "conversationId");

  const result = await Notification.updateMany(
    {
      userId: currentUserId,
      conversationId,
      read: false
    },
    {
      $set: {
        read: true
      }
    }
  );

  if (Number(result.modifiedCount || 0) > 0) {
    publishToUser(toIdString(currentUserId), {
      type: "notifications.updated",
      conversationId: toIdString(conversationId),
      notificationType: "dm"
    });
  }

  return {
    conversationId: toIdString(conversationId),
    updatedCount: Number(result.modifiedCount || 0)
  };
}

export async function markAllNotificationsRead(currentUserId) {
  assertObjectId(currentUserId, "userId");

  const result = await Notification.updateMany(
    {
      userId: currentUserId,
      read: false
    },
    {
      $set: {
        read: true
      }
    }
  );

  if (Number(result.modifiedCount || 0) > 0) {
    publishToUser(toIdString(currentUserId), {
      type: "notifications.updated"
    });
  }

  return {
    updatedCount: Number(result.modifiedCount || 0)
  };
}

export async function deleteNotification({ currentUserId, notificationId }) {
  const notification = await requireNotificationForUser(notificationId, currentUserId);
  const deletedNotificationId = toIdString(notification._id);

  await Notification.deleteOne({
    _id: notification._id,
    userId: currentUserId
  });

  publishToUser(toIdString(currentUserId), {
    type: "notifications.updated",
    notificationId: deletedNotificationId
  });

  return {
    notificationId: deletedNotificationId,
    deleted: true
  };
}

export async function deleteAllNotifications(currentUserId) {
  assertObjectId(currentUserId, "userId");

  const result = await Notification.deleteMany({
    userId: currentUserId
  });

  if (Number(result.deletedCount || 0) > 0) {
    publishToUser(toIdString(currentUserId), {
      type: "notifications.updated"
    });
  }

  return {
    deletedCount: Number(result.deletedCount || 0)
  };
}
