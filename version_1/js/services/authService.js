import {
  createAndStoreUser,
  findUserByUsername,
  getCurrentUser,
  setCurrentUser,
  clearCurrentUser
} from "./userService.js";
import {
  validateUsername,
  validateTownship,
  validateExtension,
  validatePassword
} from "../utils/validators.js";

export function registerUser({ username, township, extension, password }) {
  const safeUsername = validateUsername(username);
  const safeTownship = validateTownship(township);
  const safeExtension = validateExtension(extension);
  const safePassword = validatePassword(password);

  const user = createAndStoreUser({
    username: safeUsername,
    password: safePassword,
    location: {
      township: safeTownship,
      extension: safeExtension
    }
  });

  setCurrentUser(user);
  return user;
}

export function loginUser({ username, password }) {
  const safeUsername = validateUsername(username);
  const safePassword = validatePassword(password);

  const user = findUserByUsername(safeUsername);

  if (!user) {
    throw new Error("User not found.");
  }

  if (user.password !== safePassword) {
    throw new Error("Invalid password.");
  }

  setCurrentUser(user);
  return user;
}

export function getAuthenticatedUser() {
  return getCurrentUser();
}

export function logoutUser() {
  clearCurrentUser();
}