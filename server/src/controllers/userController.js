import {
  blockUser,
  deleteUserAvatar,
  followUser,
  getFollowerUsers,
  getDirectMessageAvailability,
  getFollowingUsers,
  getUserProfile,
  searchUsers,
  setUserPreference,
  unblockUser,
  unfollowUser,
  updateUserAvatar,
  updateDirectMessageEncryptionKey,
  updateUserProfile
} from "../services/userService.js";
import { AppError } from "../utils/appError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed;
}

export const updateProfile = asyncHandler(async (req, res) => {
  const user = await updateUserProfile(req.user._id, req.body);

  res.status(200).json({
    message: "Profile updated.",
    user
  });
});

export const uploadAvatar = asyncHandler(async (req, res) => {
  if (!Buffer.isBuffer(req.body)) {
    throw new AppError("Profile photo upload is invalid.", {
      statusCode: 400,
      code: "AVATAR_UPLOAD_INVALID",
      field: "avatar"
    });
  }

  const user = await updateUserAvatar(req.user._id, {
    fileBuffer: req.body,
    mimeType: req.headers["content-type"]
  });

  res.status(200).json({
    message: "Profile photo updated.",
    user
  });
});

export const deleteAvatar = asyncHandler(async (req, res) => {
  const user = await deleteUserAvatar(req.user._id);

  res.status(200).json({
    message: "Profile photo removed.",
    user
  });
});

export const updateDirectMessagesSetting = asyncHandler(async (req, res) => {
  const user = await setUserPreference(
    req.user._id,
    "directMessagesEnabled",
    req.body.enabled
  );

  res.status(200).json({
    message: "Direct message setting updated.",
    user
  });
});

export const updateNotificationsSetting = asyncHandler(async (req, res) => {
  const user = await setUserPreference(
    req.user._id,
    "notificationsEnabled",
    req.body.enabled
  );

  res.status(200).json({
    message: "Notification setting updated.",
    user
  });
});

export const updateDirectMessageEncryptionKeyHandler = asyncHandler(async (req, res) => {
  const user = await updateDirectMessageEncryptionKey(req.user._id, req.body);

  res.status(200).json({
    message: "Direct-message encryption key updated.",
    user
  });
});

export const search = asyncHandler(async (req, res) => {
  const users = await searchUsers(req.query.query, {
    limit: parseLimit(req.query.limit)
  });

  res.status(200).json({
    users
  });
});

export const getUser = asyncHandler(async (req, res) => {
  const result = await getUserProfile(req.user._id, req.params.userId);

  res.status(200).json(result);
});

export const getFollowers = asyncHandler(async (req, res) => {
  const users = await getFollowerUsers(req.params.userId, {
    limit: parseLimit(req.query.limit)
  });

  res.status(200).json({
    users
  });
});

export const getFollowing = asyncHandler(async (req, res) => {
  const users = await getFollowingUsers(req.params.userId, {
    limit: parseLimit(req.query.limit)
  });

  res.status(200).json({
    users
  });
});

export const getDmAvailability = asyncHandler(async (req, res) => {
  const availability = await getDirectMessageAvailability(req.user._id, req.params.userId);

  res.status(200).json({
    availability
  });
});

export const follow = asyncHandler(async (req, res) => {
  const result = await followUser(req.user._id, req.params.userId);

  res.status(200).json({
    message: "User followed.",
    ...result
  });
});

export const unfollow = asyncHandler(async (req, res) => {
  const result = await unfollowUser(req.user._id, req.params.userId);

  res.status(200).json({
    message: "User unfollowed.",
    ...result
  });
});

export const block = asyncHandler(async (req, res) => {
  const result = await blockUser(req.user._id, req.params.userId);

  res.status(200).json({
    message: "User blocked.",
    ...result
  });
});

export const unblock = asyncHandler(async (req, res) => {
  const result = await unblockUser(req.user._id, req.params.userId);

  res.status(200).json({
    message: "User unblocked.",
    ...result
  });
});
