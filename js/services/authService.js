import { apiRequest, clearAccessToken, getAccessToken, setAccessToken } from "./apiClient.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { storage } from "../storage/storage.js";
import {
  clearCurrentUser,
  getCurrentUser,
  setCurrentUser,
  syncCurrentUserFromApi,
  updateUserProfileRemote,
  upsertUser
} from "./userService.js";
import { ensureDirectMessageEncryptionSession } from "./directMessageEncryptionService.js";
import { resetConversationState } from "./messageService.js";
import { resetNotificationState } from "./notificationService.js";
import { resetPostState } from "./postService.js";
import { resetReportState } from "./reportService.js";

function clearClientSessionState() {
  resetPostState();
  resetConversationState();
  resetNotificationState();
  resetReportState();
  storage.remove(STORAGE_KEYS.USERS);
  clearAccessToken();
  clearCurrentUser();
}

async function persistAuthenticatedSession({ token, user }) {
  clearClientSessionState();
  setAccessToken(token);
  let normalizedUser = upsertUser(user);
  setCurrentUser(normalizedUser);
  normalizedUser = await ensureDirectMessageEncryptionSession({
    user: normalizedUser,
    onUserUpdated: (updatedUser) => {
      const nextUser = upsertUser(updatedUser);
      setCurrentUser(nextUser);
      return nextUser;
    }
  });
  return normalizedUser;
}

export async function registerUser({
  username,
  phoneNumber = "",
  township,
  extension,
  password,
  confirmPassword
}) {
  const response = await apiRequest("/auth/register", {
    auth: false,
    method: "POST",
    body: {
      username,
      phoneNumber,
      township,
      extension,
      password,
      confirmPassword
    }
  });

  return persistAuthenticatedSession(response);
}

export async function loginUser({ identifier, password }) {
  const response = await apiRequest("/auth/login", {
    auth: false,
    method: "POST",
    body: {
      identifier,
      password
    }
  });

  return persistAuthenticatedSession(response);
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
    const authError = new Error("You must be logged in.");
    authError.code = "AUTH_REQUIRED";
    throw authError;
  }

  return updateUserProfileRemote({
    username,
    phoneNumber,
    township,
    extension,
    avatarDataUrl,
    currentPassword,
    newPassword,
    confirmNewPassword
  });
}

export async function requestPhoneVerificationOtp() {
  return apiRequest("/auth/otp/send", {
    method: "POST"
  });
}

export async function verifyAuthenticatedUserPhoneOtp({ code }) {
  await apiRequest("/auth/otp/verify", {
    method: "POST",
    body: {
      code
    }
  });

  return syncCurrentUserFromApi();
}

export function getAuthenticatedUser() {
  return getCurrentUser();
}

export async function resolveAuthenticatedUser() {
  const currentUser = getCurrentUser();

  if (currentUser?.id) {
    return currentUser;
  }

  if (!getAccessToken()) {
    return null;
  }

  try {
    const resolvedUser = await syncCurrentUserFromApi();
    return ensureDirectMessageEncryptionSession({
      user: resolvedUser,
      onUserUpdated: (updatedUser) => {
        const nextUser = upsertUser(updatedUser);
        setCurrentUser(nextUser);
        return nextUser;
      }
    });
  } catch (error) {
    clearClientSessionState();
    return null;
  }
}

export function logoutUser() {
  clearClientSessionState();
}
