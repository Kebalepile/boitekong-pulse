import { storage } from "../storage/storage.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { createUser } from "../models/userModel.js";
import {
  validateUsername,
  validatePhoneNumber,
  validateTownship,
  validateExtension
} from "../utils/validators.js";

function makeError(code, field, message) {
  const error = new Error(message);
  error.code = code;
  error.field = field;
  return error;
}

function normalizeUserRecord(user = {}) {
  return {
    ...user,
    avatarDataUrl: typeof user.avatarDataUrl === "string" ? user.avatarDataUrl : "",
    phoneNumber: typeof user.phoneNumber === "string" ? user.phoneNumber : "",
    followingUserIds: Array.isArray(user.followingUserIds)
      ? Array.from(
          new Set(
            user.followingUserIds.filter(
              (followedUserId) => typeof followedUserId === "string" && followedUserId.trim()
            )
          )
        )
      : [],
    createdAt:
      typeof user.createdAt === "string" && user.createdAt
        ? user.createdAt
        : new Date().toISOString()
  };
}

export function getUsers() {
  const users = storage.get(STORAGE_KEYS.USERS, []);
  return Array.isArray(users) ? users.map(normalizeUserRecord) : [];
}

export function saveUsers(users) {
  storage.set(STORAGE_KEYS.USERS, users);
}

export function findUserByUsername(username) {
  const users = getUsers();
  const normalized = validateUsername(username).toLowerCase();
  return users.find((user) => user.username.toLowerCase() === normalized) || null;
}

export function findUserById(userId) {
  const users = getUsers();
  return users.find((user) => user.id === userId) || null;
}

export function createAndStoreUser({ username, location, passwordHash, phoneNumber = "" }) {
  const existingUser = findUserByUsername(username);

  if (existingUser) {
    throw makeError("USERNAME_EXISTS", "username", "Username already exists.");
  }

  const user = createUser({ username, location, passwordHash, phoneNumber });
  const users = getUsers();

  users.push(user);
  saveUsers(users);

  return user;
}

export function updateUserProfile({
  userId,
  username,
  phoneNumber,
  township,
  extension,
  passwordHash,
  avatarDataUrl
}) {
  const users = getUsers();
  const userIndex = users.findIndex((user) => user.id === userId);

  if (userIndex === -1) {
    throw makeError("USER_NOT_FOUND", null, "User not found.");
  }

  const safeUsername = validateUsername(username);
  const safePhoneNumber = validatePhoneNumber(phoneNumber);
  const safeTownship = validateTownship(township);
  const safeExtension = validateExtension(extension);

  const usernameTakenByAnotherUser = users.some(
    (user) => user.id !== userId && user.username.toLowerCase() === safeUsername.toLowerCase()
  );

  if (usernameTakenByAnotherUser) {
    throw makeError("USERNAME_EXISTS", "username", "Username already exists.");
  }

  const currentRecord = users[userIndex];

  const updatedUser = {
    ...currentRecord,
    username: safeUsername,
    phoneNumber: safePhoneNumber,
    location: {
      township: safeTownship,
      extension: safeExtension
    },
    avatarDataUrl:
      typeof avatarDataUrl === "string"
        ? avatarDataUrl
        : currentRecord.avatarDataUrl || ""
  };

  if (passwordHash) {
    updatedUser.passwordHash = passwordHash;
  }

  users[userIndex] = updatedUser;
  saveUsers(users);
  setCurrentUser(updatedUser);

  return updatedUser;
}

export function setCurrentUser(user) {
  storage.set(STORAGE_KEYS.CURRENT_USER, user ? normalizeUserRecord(user) : null);
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

export function followUser({ currentUserId, targetUserId }) {
  if (!currentUserId || !targetUserId) {
    throw makeError("FOLLOW_INVALID", null, "Could not follow that user.");
  }

  if (currentUserId === targetUserId) {
    throw makeError("FOLLOW_SELF", null, "You cannot follow yourself.");
  }

  const users = getUsers();
  const currentUserIndex = users.findIndex((user) => user.id === currentUserId);
  const targetUser = users.find((user) => user.id === targetUserId);

  if (currentUserIndex === -1 || !targetUser) {
    throw makeError("USER_NOT_FOUND", null, "User not found.");
  }

  const currentUser = users[currentUserIndex];

  if (currentUser.followingUserIds.includes(targetUserId)) {
    return currentUser;
  }

  const updatedUser = {
    ...currentUser,
    followingUserIds: [...currentUser.followingUserIds, targetUserId]
  };

  users[currentUserIndex] = updatedUser;
  saveUsers(users);

  if (getCurrentUser()?.id === currentUserId) {
    setCurrentUser(updatedUser);
  }

  return updatedUser;
}

export function unfollowUser({ currentUserId, targetUserId }) {
  if (!currentUserId || !targetUserId) {
    throw makeError("FOLLOW_INVALID", null, "Could not update follow state.");
  }

  const users = getUsers();
  const currentUserIndex = users.findIndex((user) => user.id === currentUserId);

  if (currentUserIndex === -1) {
    throw makeError("USER_NOT_FOUND", null, "User not found.");
  }

  const currentUser = users[currentUserIndex];
  const updatedUser = {
    ...currentUser,
    followingUserIds: currentUser.followingUserIds.filter(
      (followedUserId) => followedUserId !== targetUserId
    )
  };

  users[currentUserIndex] = updatedUser;
  saveUsers(users);

  if (getCurrentUser()?.id === currentUserId) {
    setCurrentUser(updatedUser);
  }

  return updatedUser;
}
