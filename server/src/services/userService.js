import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { AppError } from "../utils/appError.js";
import {
  normalizeAvatarUrl,
  validateBoolean,
  validateCurrentPassword,
  validateExtension,
  validatePasswordConfirmation,
  validateRequiredPhoneNumber,
  validateTownship,
  validateUsername
} from "../utils/validators.js";

function hasId(list, targetId) {
  return list.some((value) => String(value) === String(targetId));
}

function removeId(list, targetId) {
  return list.filter((value) => String(value) !== String(targetId));
}

async function requireUser(userId, options = {}) {
  const query = User.findById(userId);

  if (options.includePasswordHash) {
    query.select("+passwordHash");
  }

  const user = await query;

  if (!user) {
    throw new AppError("User not found.", {
      statusCode: 404,
      code: "USER_NOT_FOUND"
    });
  }

  return user;
}

export function serializeUser(user) {
  return {
    id: String(user._id),
    username: user.username,
    phoneNumber: user.phoneNumber,
    avatarUrl: user.avatarUrl || "",
    location: {
      township: user.location?.township || "",
      extension: user.location?.extension || ""
    },
    directMessagesEnabled: user.directMessagesEnabled !== false,
    notificationsEnabled: user.notificationsEnabled !== false,
    blockedUserIds: Array.isArray(user.blockedUserIds)
      ? user.blockedUserIds.map((value) => String(value))
      : [],
    followingUserIds: Array.isArray(user.followingUserIds)
      ? user.followingUserIds.map((value) => String(value))
      : [],
    phoneVerified: user.phoneVerified === true,
    lastSeen: user.lastSeen,
    roles: Array.isArray(user.roles) ? user.roles : ["user"],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export async function updateUserProfile(userId, payload = {}) {
  const user = await requireUser(userId, { includePasswordHash: true });

  const safeUsername =
    payload.username === undefined ? user.username : validateUsername(payload.username);
  const safePhoneNumber =
    payload.phoneNumber === undefined
      ? user.phoneNumber
      : validateRequiredPhoneNumber(payload.phoneNumber);
  const safeTownship =
    payload.township === undefined
      ? user.location?.township
      : validateTownship(payload.township);
  const safeExtension =
    payload.extension === undefined
      ? user.location?.extension
      : validateExtension(payload.extension);
  const safeAvatarUrl =
    payload.avatarUrl === undefined
      ? user.avatarUrl || ""
      : normalizeAvatarUrl(payload.avatarUrl);

  const [usernameOwner, phoneOwner] = await Promise.all([
    User.findOne({
      usernameLower: safeUsername.toLowerCase(),
      _id: { $ne: user._id }
    }),
    User.findOne({
      phoneNumber: safePhoneNumber,
      _id: { $ne: user._id }
    })
  ]);

  if (usernameOwner) {
    throw new AppError("Username already exists.", {
      statusCode: 409,
      code: "USERNAME_EXISTS",
      field: "username"
    });
  }

  if (phoneOwner) {
    throw new AppError("Phone number already exists.", {
      statusCode: 409,
      code: "PHONE_NUMBER_EXISTS",
      field: "phoneNumber"
    });
  }

  const wantsPasswordChange =
    String(payload.newPassword ?? "").trim() || String(payload.confirmNewPassword ?? "").trim();

  if (wantsPasswordChange) {
    const currentPassword = validateCurrentPassword(payload.currentPassword);
    const passwordMatches = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!passwordMatches) {
      throw new AppError("Current password is incorrect.", {
        statusCode: 401,
        code: "CURRENT_PASSWORD_INVALID",
        field: "currentPassword"
      });
    }

    const safePassword = validatePasswordConfirmation(
      payload.newPassword,
      payload.confirmNewPassword
    );

    user.passwordHash = await bcrypt.hash(safePassword, 12);
  }

  user.username = safeUsername;
  user.usernameLower = safeUsername.toLowerCase();
  user.phoneNumber = safePhoneNumber;
  user.avatarUrl = safeAvatarUrl;
  user.location = {
    township: safeTownship,
    extension: safeExtension
  };

  await user.save();

  return serializeUser(user);
}

export async function setUserPreference(userId, key, enabled) {
  const safeEnabled = validateBoolean(enabled, "enabled");
  const user = await requireUser(userId);

  if (!["directMessagesEnabled", "notificationsEnabled"].includes(key)) {
    throw new AppError("Preference key is invalid.", {
      statusCode: 400,
      code: "PREFERENCE_INVALID"
    });
  }

  user[key] = safeEnabled;
  await user.save();

  return serializeUser(user);
}

export async function followUser(currentUserId, targetUserId) {
  if (String(currentUserId) === String(targetUserId)) {
    throw new AppError("You cannot follow yourself.", {
      statusCode: 400,
      code: "FOLLOW_SELF"
    });
  }

  const [currentUser, targetUser] = await Promise.all([
    requireUser(currentUserId),
    requireUser(targetUserId)
  ]);

  if (!hasId(currentUser.followingUserIds, targetUser._id)) {
    currentUser.followingUserIds.push(targetUser._id);
    await currentUser.save();
  }

  return {
    user: serializeUser(currentUser),
    targetUserId: String(targetUser._id),
    following: true
  };
}

export async function unfollowUser(currentUserId, targetUserId) {
  const currentUser = await requireUser(currentUserId);
  await requireUser(targetUserId);

  currentUser.followingUserIds = removeId(currentUser.followingUserIds, targetUserId);
  await currentUser.save();

  return {
    user: serializeUser(currentUser),
    targetUserId: String(targetUserId),
    following: false
  };
}

export async function blockUser(currentUserId, targetUserId) {
  if (String(currentUserId) === String(targetUserId)) {
    throw new AppError("You cannot block yourself.", {
      statusCode: 400,
      code: "BLOCK_SELF"
    });
  }

  const [currentUser, targetUser] = await Promise.all([
    requireUser(currentUserId),
    requireUser(targetUserId)
  ]);

  if (!hasId(currentUser.blockedUserIds, targetUser._id)) {
    currentUser.blockedUserIds.push(targetUser._id);
    await currentUser.save();
  }

  return {
    user: serializeUser(currentUser),
    targetUserId: String(targetUser._id),
    blocked: true
  };
}

export async function unblockUser(currentUserId, targetUserId) {
  const currentUser = await requireUser(currentUserId);
  await requireUser(targetUserId);

  currentUser.blockedUserIds = removeId(currentUser.blockedUserIds, targetUserId);
  await currentUser.save();

  return {
    user: serializeUser(currentUser),
    targetUserId: String(targetUserId),
    blocked: false
  };
}

export async function getDirectMessageAvailability(senderUserId, recipientUserId) {
  if (!senderUserId || !recipientUserId || String(senderUserId) === String(recipientUserId)) {
    return {
      allowed: false,
      code: "DM_INVALID",
      message: "Could not open direct messages."
    };
  }

  const [sender, recipient] = await Promise.all([
    User.findById(senderUserId),
    User.findById(recipientUserId)
  ]);

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

  if (hasId(sender.blockedUserIds, recipient._id)) {
    return {
      allowed: false,
      code: "SENDER_BLOCKED_RECIPIENT",
      message: `You blocked ${recipient.username}. Unblock them to continue chatting.`
    };
  }

  if (hasId(recipient.blockedUserIds, sender._id)) {
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
