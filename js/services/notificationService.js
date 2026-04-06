import { storage } from "../storage/storage.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { getHiddenTargetIdsForUser } from "./reportService.js";

let notificationOpenHandler = null;

function normalizeNotificationRecord(notification = {}) {
  return {
    id: typeof notification.id === "string" && notification.id ? notification.id : crypto.randomUUID(),
    userId: typeof notification.userId === "string" ? notification.userId : "",
    type: typeof notification.type === "string" ? notification.type : "system",
    actorUserId: typeof notification.actorUserId === "string" ? notification.actorUserId : "",
    postId: typeof notification.postId === "string" ? notification.postId : "",
    commentId: typeof notification.commentId === "string" ? notification.commentId : "",
    conversationId:
      typeof notification.conversationId === "string" ? notification.conversationId : "",
    messageId: typeof notification.messageId === "string" ? notification.messageId : "",
    title: typeof notification.title === "string" ? notification.title : "",
    text: typeof notification.text === "string" ? notification.text : "",
    createdAt:
      typeof notification.createdAt === "string" && notification.createdAt
        ? notification.createdAt
        : new Date().toISOString(),
    read: notification.read === true
  };
}

export function getNotifications() {
  const notifications = storage.get(STORAGE_KEYS.NOTIFICATIONS, []);
  return Array.isArray(notifications)
    ? notifications.map(normalizeNotificationRecord)
    : [];
}

export function saveNotifications(notifications) {
  storage.set(STORAGE_KEYS.NOTIFICATIONS, notifications);
}

export function createNotification(notification) {
  const targetUser = findNotificationUser(notification?.userId);

  if (targetUser && targetUser.notificationsEnabled === false) {
    return null;
  }

  const notifications = getNotifications();
  const nextNotification = normalizeNotificationRecord({
    id: crypto.randomUUID(),
    ...notification,
    createdAt: new Date().toISOString(),
    read: false
  });

  notifications.push(nextNotification);
  saveNotifications(notifications);
  showBrowserNotification(nextNotification);

  return nextNotification;
}

export function getNotificationsForUser(userId) {
  return getNotifications()
    .filter(
      (notification) =>
        notification.userId === userId &&
        !isNotificationHiddenForUser(notification, userId)
    )
    .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
}

export function getUnreadNotificationCount(userId) {
  return getNotificationsForUser(userId).length;
}

export function removeNotification(notificationId) {
  const notifications = getNotifications();
  const nextNotifications = notifications.filter(
    (notification) => notification.id !== notificationId
  );

  if (nextNotifications.length === notifications.length) {
    return null;
  }

  saveNotifications(nextNotifications);
  return nextNotifications;
}

export function clearNotificationsForUser(userId) {
  const notifications = getNotifications();
  const nextNotifications = notifications.filter((notification) => notification.userId !== userId);

  if (nextNotifications.length === notifications.length) {
    return notifications;
  }

  saveNotifications(nextNotifications);
  return nextNotifications;
}

export function clearConversationNotifications({ userId, conversationId }) {
  if (!userId || !conversationId) {
    return getNotifications();
  }

  const notifications = getNotifications();
  const nextNotifications = notifications.filter(
    (notification) =>
      notification.userId !== userId || notification.conversationId !== conversationId
  );

  if (nextNotifications.length === notifications.length) {
    return notifications;
  }

  saveNotifications(nextNotifications);
  return nextNotifications;
}

export function clearNotificationsForReportedTarget({ userId, targetType, targetId }) {
  const safeUserId = typeof userId === "string" ? userId.trim() : "";
  const safeTargetId = typeof targetId === "string" ? targetId.trim() : "";
  const safeTargetType = targetType === "comment" ? "comment" : "post";

  if (!safeUserId || !safeTargetId) {
    return getNotifications();
  }

  const notifications = getNotifications();
  const nextNotifications = notifications.filter((notification) => {
    if (notification.userId !== safeUserId) {
      return true;
    }

    if (safeTargetType === "post") {
      return notification.postId !== safeTargetId;
    }

    return notification.commentId !== safeTargetId;
  });

  if (nextNotifications.length === notifications.length) {
    return notifications;
  }

  saveNotifications(nextNotifications);
  return nextNotifications;
}

export async function ensureBrowserNotificationPermission() {
  const status = getBrowserNotificationPermissionStatus();

  if (!status.supported || status.permission === "granted" || status.permission === "denied") {
    return status;
  }

  const permission = await Notification.requestPermission();
  return {
    supported: true,
    permission
  };
}

export function registerNotificationOpenHandler(handler) {
  notificationOpenHandler = typeof handler === "function" ? handler : null;
}

export function getBrowserNotificationPermissionStatus() {
  if (!isBrowserNotificationSupported()) {
    return {
      supported: false,
      permission: "unsupported"
    };
  }

  return {
    supported: true,
    permission: Notification.permission
  };
}

function isBrowserNotificationSupported() {
  return typeof window !== "undefined" && typeof Notification !== "undefined";
}

function getCurrentUserId() {
  const currentUser = storage.get(STORAGE_KEYS.CURRENT_USER, null);
  return typeof currentUser?.id === "string" ? currentUser.id : "";
}

function findNotificationUser(userId) {
  if (!userId) {
    return null;
  }

  const users = storage.get(STORAGE_KEYS.USERS, []);

  if (!Array.isArray(users)) {
    return null;
  }

  return users.find((user) => user?.id === userId) || null;
}

function findActorUsername(actorUserId) {
  if (!actorUserId) {
    return "Someone";
  }

  const actor = findNotificationUser(actorUserId);
  return actor?.username || "Someone";
}

function getBrowserNotificationCopy(notification) {
  const actorName = findActorUsername(notification.actorUserId);

  if (notification.type === "dm") {
    return {
      title: "New message",
      body: `${actorName} sent you a message`
    };
  }

  if (notification.type === "follow") {
    return {
      title: "New follower",
      body: `${actorName} followed you`
    };
  }

  if (notification.type === "post_comment") {
    return {
      title: "New comment",
      body: `${actorName} commented on your post`
    };
  }

  if (notification.type === "comment_reply") {
    return {
      title: "New reply",
      body: `${actorName} replied to your comment`
    };
  }

  return {
    title: notification.title || "Notification",
    body: notification.text || "Open the app to view more."
  };
}

function showBrowserNotification(notification) {
  if (!isBrowserNotificationSupported() || Notification.permission !== "granted") {
    return null;
  }

  const currentUserId = getCurrentUserId();

  if (!currentUserId || currentUserId !== notification.userId) {
    return null;
  }

  const { title, body } = getBrowserNotificationCopy(notification);
  const browserNotification = new Notification(title, {
    body,
    tag: notification.type === "dm" && notification.conversationId
      ? `dm-${notification.conversationId}`
      : notification.id
  });

  browserNotification.onclick = () => {
    browserNotification.close();

    try {
      window.focus();
    } catch (error) {
      // Ignore focus failures and continue opening in-app flow.
    }

    if (typeof notificationOpenHandler === "function") {
      notificationOpenHandler(notification);
    }
  };

  return browserNotification;
}

function isNotificationHiddenForUser(notification, userId) {
  const hiddenPostIds = getHiddenTargetIdsForUser({
    userId,
    targetType: "post"
  });
  const hiddenCommentIds = getHiddenTargetIdsForUser({
    userId,
    targetType: "comment"
  });

  if (notification.postId && hiddenPostIds.has(notification.postId)) {
    return true;
  }

  if (notification.commentId && hiddenCommentIds.has(notification.commentId)) {
    return true;
  }

  return false;
}
