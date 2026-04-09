import {
  blockUser,
  followUser,
  getDirectMessageAvailability,
  setUserPreference,
  unblockUser,
  unfollowUser,
  updateUserProfile
} from "../services/userService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const updateProfile = asyncHandler(async (req, res) => {
  const user = await updateUserProfile(req.user._id, req.body);

  res.status(200).json({
    message: "Profile updated.",
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
