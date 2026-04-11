import { storage } from "../storage/storage.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { apiRequest } from "./apiClient.js";
import { normalizeUserDirectMessageEncryption } from "../utils/directMessageEncryption.js";

function createQueryString(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    query.set(key, String(value));
  });

  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

function normalizeUserRecord(user = {}) {
  const avatarDataUrl =
    typeof user.avatarDataUrl === "string" && user.avatarDataUrl
      ? user.avatarDataUrl
      : typeof user.avatarUrl === "string"
        ? user.avatarUrl
        : "";

  return {
    ...user,
    avatarDataUrl,
    avatarUrl:
      typeof user.avatarUrl === "string" && user.avatarUrl ? user.avatarUrl : avatarDataUrl,
    phoneNumber: typeof user.phoneNumber === "string" ? user.phoneNumber : "",
    directMessagesEnabled: user.directMessagesEnabled !== false,
    notificationsEnabled: user.notificationsEnabled !== false,
    directMessageEncryption: normalizeUserDirectMessageEncryption(
      user.directMessageEncryption
    ),
    blockedUserIds: Array.isArray(user.blockedUserIds)
      ? Array.from(
          new Set(
            user.blockedUserIds.filter(
              (blockedUserId) => typeof blockedUserId === "string" && blockedUserId.trim()
            )
          )
        )
      : [],
    followingUserIds: Array.isArray(user.followingUserIds)
      ? Array.from(
          new Set(
            user.followingUserIds.filter(
              (followedUserId) => typeof followedUserId === "string" && followedUserId.trim()
            )
          )
        )
      : [],
    location: {
      township: typeof user.location?.township === "string" ? user.location.township : "",
      extension: typeof user.location?.extension === "string" ? user.location.extension : ""
    },
    createdAt:
      typeof user.createdAt === "string" && user.createdAt
        ? user.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof user.updatedAt === "string" && user.updatedAt
        ? user.updatedAt
        : null
  };
}

export function getUsers() {
  const users = storage.get(STORAGE_KEYS.USERS, []);
  return Array.isArray(users) ? users.map(normalizeUserRecord) : [];
}

export function saveUsers(users) {
  storage.set(
    STORAGE_KEYS.USERS,
    Array.isArray(users) ? users.map(normalizeUserRecord) : []
  );
}

export function upsertUsers(users = []) {
  const incomingUsers = Array.isArray(users)
    ? users
        .map(normalizeUserRecord)
        .filter((user) => typeof user.id === "string" && user.id.trim())
    : [];

  if (incomingUsers.length === 0) {
    return [];
  }

  const usersById = new Map(getUsers().map((user) => [user.id, user]));

  incomingUsers.forEach((user) => {
    usersById.set(user.id, {
      ...(usersById.get(user.id) || {}),
      ...user
    });
  });

  const nextUsers = Array.from(usersById.values());
  saveUsers(nextUsers);
  return incomingUsers.map((user) => usersById.get(user.id));
}

export function upsertUser(user) {
  if (!user) {
    return null;
  }

  return upsertUsers([user])[0] || null;
}

export function findUserById(userId) {
  const users = getUsers();
  return users.find((user) => user.id === userId) || null;
}

export function setCurrentUser(user) {
  const normalizedUser = user ? normalizeUserRecord(user) : null;

  if (normalizedUser) {
    upsertUser(normalizedUser);
  }

  storage.set(STORAGE_KEYS.CURRENT_USER, normalizedUser);
}

export function getCurrentUser() {
  const currentUser = storage.get(STORAGE_KEYS.CURRENT_USER, null);
  return currentUser ? normalizeUserRecord(currentUser) : null;
}

export function clearCurrentUser() {
  storage.remove(STORAGE_KEYS.CURRENT_USER);
}

export function getFollowerCount(userId) {
  return getUsers().filter((user) => user.followingUserIds.includes(userId)).length;
}

export function getFollowerUsers(userId, { limit = Infinity } = {}) {
  return getUsers()
    .filter((user) => user.followingUserIds.includes(userId))
    .slice(0, limit);
}

export function getFollowingUsers(userId, { limit = Infinity } = {}) {
  const users = getUsers();
  const user = users.find((entry) => entry.id === userId);

  if (!user) {
    return [];
  }

  const usersById = new Map(users.map((entry) => [entry.id, entry]));

  return user.followingUserIds
    .map((followedUserId) => usersById.get(followedUserId) || null)
    .filter(Boolean)
    .slice(0, limit);
}

export function isFollowingUser({ currentUserId, targetUserId }) {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
    return false;
  }

  const currentUser = findUserById(currentUserId);
  return Boolean(currentUser?.followingUserIds.includes(targetUserId));
}

export function areNotificationsEnabled(userId) {
  if (!userId) {
    return false;
  }

  const user = findUserById(userId);
  return user?.notificationsEnabled !== false;
}

export function isUserBlocked({ currentUserId, targetUserId }) {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
    return false;
  }

  const currentUser = findUserById(currentUserId);
  return Boolean(currentUser?.blockedUserIds.includes(targetUserId));
}

export function getDirectMessageAvailability({ senderUserId, recipientUserId }) {
  if (!senderUserId || !recipientUserId) {
    return {
      allowed: false,
      code: "DM_INVALID",
      message: "Could not open direct messages."
    };
  }

  const sender = findUserById(senderUserId);
  const recipient = findUserById(recipientUserId);

  if (!sender || !recipient) {
    return {
      allowed: false,
      code: "USER_NOT_FOUND",
      message: "User not found."
    };
  }

  if (sender.directMessagesEnabled === false) {
    return {
      allowed: false,
      code: "SENDER_DM_DISABLED",
      message: "You disabled direct messages. Enable them to send messages."
    };
  }

  if (recipient.directMessagesEnabled === false) {
    return {
      allowed: false,
      code: "RECIPIENT_DM_DISABLED",
      message: `${recipient.username} has disabled direct messages.`
    };
  }

  if (sender.blockedUserIds.includes(recipientUserId)) {
    return {
      allowed: false,
      code: "SENDER_BLOCKED_RECIPIENT",
      message: `You blocked ${recipient.username}. Unblock them to continue chatting.`
    };
  }

  if (recipient.blockedUserIds.includes(senderUserId)) {
    return {
      allowed: false,
      code: "RECIPIENT_BLOCKED_SENDER",
      message: `${recipient.username} blocked you.`
    };
  }

  return {
    allowed: true,
    code: "DM_ALLOWED",
    message: ""
  };
}

export async function syncCurrentUserFromApi() {
  const response = await apiRequest("/auth/me");
  const user = upsertUser(response.user);
  setCurrentUser(user);
  return user;
}

export async function fetchUserProfile(userId) {
  const response = await apiRequest(`/users/${encodeURIComponent(userId)}`);
  const user = upsertUser(response.user);

  return {
    user,
    stats: response.stats || {
      followerCount: getFollowerCount(userId),
      followingCount: Array.isArray(user?.followingUserIds) ? user.followingUserIds.length : 0,
      isCurrentUser: getCurrentUser()?.id === userId,
      isFollowing: isFollowingUser({
        currentUserId: getCurrentUser()?.id || "",
        targetUserId: userId
      })
    }
  };
}

export async function searchUsersRemote(query, { limit } = {}) {
  const normalizedQuery = String(query ?? "").trim();

  const response = await apiRequest(
    `/users/search${createQueryString({
      query: normalizedQuery,
      limit
    })}`
  );

  return upsertUsers(response.users || []);
}

export async function loadUserDirectory({ limit } = {}) {
  return searchUsersRemote("", { limit });
}

export async function fetchFollowerUsers(userId, { limit } = {}) {
  const response = await apiRequest(
    `/users/${encodeURIComponent(userId)}/followers${createQueryString({ limit })}`
  );

  return upsertUsers(response.users || []);
}

export async function fetchFollowingUsers(userId, { limit } = {}) {
  const response = await apiRequest(
    `/users/${encodeURIComponent(userId)}/following${createQueryString({ limit })}`
  );

  return upsertUsers(response.users || []);
}

export async function updateUserProfileRemote({
  username,
  phoneNumber,
  township,
  extension,
  avatarDataUrl,
  avatarUrl,
  currentPassword,
  newPassword,
  confirmNewPassword
}) {
  const response = await apiRequest("/users/me/profile", {
    method: "PATCH",
    body: {
      username,
      phoneNumber,
      township,
      extension,
      avatarUrl: avatarDataUrl ?? avatarUrl ?? "",
      currentPassword,
      newPassword,
      confirmNewPassword
    }
  });
  const user = upsertUser(response.user);
  setCurrentUser(user);
  return user;
}

export async function followUserRemote({ targetUserId }) {
  const response = await apiRequest(`/users/${encodeURIComponent(targetUserId)}/follow`, {
    method: "POST"
  });
  const user = upsertUser(response.user);
  setCurrentUser(user);
  return user;
}

export async function unfollowUserRemote({ targetUserId }) {
  const response = await apiRequest(`/users/${encodeURIComponent(targetUserId)}/follow`, {
    method: "DELETE"
  });
  const user = upsertUser(response.user);
  setCurrentUser(user);
  return user;
}

export async function blockUserRemote({ targetUserId }) {
  const response = await apiRequest(`/users/${encodeURIComponent(targetUserId)}/block`, {
    method: "POST"
  });
  const user = upsertUser(response.user);
  setCurrentUser(user);
  return user;
}

export async function unblockUserRemote({ targetUserId }) {
  const response = await apiRequest(`/users/${encodeURIComponent(targetUserId)}/block`, {
    method: "DELETE"
  });
  const user = upsertUser(response.user);
  setCurrentUser(user);
  return user;
}

export async function setDirectMessagesEnabledRemote({ enabled }) {
  const response = await apiRequest("/users/me/settings/direct-messages", {
    method: "PATCH",
    body: {
      enabled
    }
  });
  const user = upsertUser(response.user);
  setCurrentUser(user);
  return user;
}

export async function setNotificationsEnabledRemote({ enabled }) {
  const response = await apiRequest("/users/me/settings/notifications", {
    method: "PATCH",
    body: {
      enabled
    }
  });
  const user = upsertUser(response.user);
  setCurrentUser(user);
  return user;
}

export async function getDirectMessageAvailabilityRemote({ recipientUserId }) {
  const response = await apiRequest(
    `/users/${encodeURIComponent(recipientUserId)}/dm-availability`
  );

  return response.availability || getDirectMessageAvailability({
    senderUserId: getCurrentUser()?.id || "",
    recipientUserId
  });
}
