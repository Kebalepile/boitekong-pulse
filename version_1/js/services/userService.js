import { storage } from "../storage/storage.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { createUser } from "../models/userModel.js";
import {
  validateUsername,
  validateTownship,
  validateExtension,
  validatePassword
} from "../utils/validators.js";

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

export function createAndStoreUser({ username, location, password }) {
  const existingUser = findUserByUsername(username);

  if (existingUser) {
    throw new Error("Username already exists.");
  }

  const user = createUser({ username, location, password });
  const users = getUsers();

  users.push(user);
  saveUsers(users);

  return user;
}

export function updateUserProfile({ userId, username, township, extension, password }) {
  const users = getUsers();
  const userIndex = users.findIndex((user) => user.id === userId);

  if (userIndex === -1) {
    throw new Error("User not found.");
  }

  const safeUsername = validateUsername(username);
  const safeTownship = validateTownship(township);
  const safeExtension = validateExtension(extension);
  const safePassword = validatePassword(password);

  const usernameTakenByAnotherUser = users.some(
    (user) => user.id !== userId && user.username.toLowerCase() === safeUsername.toLowerCase()
  );

  if (usernameTakenByAnotherUser) {
    throw new Error("Username already exists.");
  }

  const updatedUser = {
    ...users[userIndex],
    username: safeUsername,
    password: safePassword,
    location: {
      township: safeTownship,
      extension: safeExtension
    }
  };

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