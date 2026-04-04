import { storage } from "../storage/storage.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { createUser } from "../models/userModel.js";
import {
  validateUsername,
  validateTownship,
  validateExtension
} from "../utils/validators.js";

function makeError(code, field, message) {
  const error = new Error(message);
  error.code = code;
  error.field = field;
  return error;
}

export function getUsers() {
  return storage.get(STORAGE_KEYS.USERS, []);
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

export function createAndStoreUser({ username, location, passwordHash }) {
  const existingUser = findUserByUsername(username);

  if (existingUser) {
    throw makeError("USERNAME_EXISTS", "username", "Username already exists.");
  }

  const user = createUser({ username, location, passwordHash });
  const users = getUsers();

  users.push(user);
  saveUsers(users);

  return user;
}

export function updateUserProfile({
  userId,
  username,
  township,
  extension,
  passwordHash
}) {
  const users = getUsers();
  const userIndex = users.findIndex((user) => user.id === userId);

  if (userIndex === -1) {
    throw makeError("USER_NOT_FOUND", null, "User not found.");
  }

  const safeUsername = validateUsername(username);
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
    location: {
      township: safeTownship,
      extension: safeExtension
    }
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
  storage.set(STORAGE_KEYS.CURRENT_USER, user);
}

export function getCurrentUser() {
  return storage.get(STORAGE_KEYS.CURRENT_USER, null);
}

export function clearCurrentUser() {
  storage.remove(STORAGE_KEYS.CURRENT_USER);
}