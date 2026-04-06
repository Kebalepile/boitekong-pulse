import {
  createAndStoreUser,
  findUserByPhoneNumber,
  findUserByUsername,
  getCurrentUser,
  setCurrentUser,
  clearCurrentUser,
  updateUserProfile
} from "./userService.js";
import {
  validateUsername,
  validateTownship,
  validateExtension,
  validatePhoneNumber,
  validateRequiredPhoneNumber,
  validatePasswordConfirmation,
  validatePassword,
  validateCurrentPassword
} from "../utils/validators.js";
import { hashPassword } from "../utils/crypto.js";

function makeError(code, field, message) {
  const error = new Error(message);
  error.code = code;
  error.field = field;
  return error;
}

export async function registerUser({
  username,
  phoneNumber = "",
  township,
  extension,
  password,
  confirmPassword
}) {
  const safeUsername = validateUsername(username);
  const safePhoneNumber = validateRequiredPhoneNumber(phoneNumber);
  const safeTownship = validateTownship(township);
  const safeExtension = validateExtension(extension);
  const safePassword = validatePasswordConfirmation(password, confirmPassword);
  const passwordHash = await hashPassword(safePassword);

  const user = createAndStoreUser({
    username: safeUsername,
    phoneNumber: safePhoneNumber,
    location: {
      township: safeTownship,
      extension: safeExtension
    },
    passwordHash
  });

  setCurrentUser(user);
  return user;
}

function resolveLoginUser(identifier) {
  const safeIdentifier = typeof identifier === "string" ? identifier.trim() : "";
  let user = null;

  try {
    const safeUsername = validateUsername(safeIdentifier);
    user = findUserByUsername(safeUsername);
  } catch {
    user = null;
  }

  if (user) {
    return user;
  }

  try {
    const safePhoneNumber = validateRequiredPhoneNumber(safeIdentifier);
    return findUserByPhoneNumber(safePhoneNumber);
  } catch {
    return null;
  }
}

export async function loginUser({ identifier, password }) {
  const safeIdentifier = typeof identifier === "string" ? identifier.trim() : "";
  const safePassword = validatePassword(password);
  const passwordHash = await hashPassword(safePassword);

  if (!safeIdentifier) {
    throw makeError(
      "LOGIN_IDENTIFIER_REQUIRED",
      "identifier",
      "Enter your username or phone number."
    );
  }

  const user = resolveLoginUser(safeIdentifier);

  if (!user) {
    throw makeError("USER_NOT_FOUND", "identifier", "Account not found.");
  }

  if (user.passwordHash !== passwordHash) {
    throw makeError("PASSWORD_INVALID", "password", "Invalid password.");
  }

  setCurrentUser(user);
  return user;
}

export async function updateAuthenticatedUserProfile({
  currentUser,
  username,
  phoneNumber,
  township,
  extension,
  avatarDataUrl,
  currentPassword,
  newPassword,
  confirmNewPassword
}) {
  if (!currentUser?.id) {
    throw makeError("AUTH_REQUIRED", null, "You must be logged in.");
  }

  let passwordHash;

  const wantsPasswordChange = newPassword.trim() || confirmNewPassword.trim();

  if (wantsPasswordChange) {
    const safeCurrentPassword = validateCurrentPassword(currentPassword);
    const currentPasswordHash = await hashPassword(safeCurrentPassword);

    if (currentUser.passwordHash !== currentPasswordHash) {
      throw makeError(
        "CURRENT_PASSWORD_INVALID",
        "currentPassword",
        "Current password is incorrect."
      );
    }

    const safeNewPassword = validatePasswordConfirmation(newPassword, confirmNewPassword);
    passwordHash = await hashPassword(safeNewPassword);
  }

  return updateUserProfile({
    userId: currentUser.id,
    username,
    phoneNumber,
    township,
    extension,
    passwordHash,
    avatarDataUrl
  });
}

export function getAuthenticatedUser() {
  return getCurrentUser();
}

export function logoutUser() {
  clearCurrentUser();
}
