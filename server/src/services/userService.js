import bcrypt from "bcryptjs";
import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/appError.js";
import { normalizeDirectMessageEncryptionRecord } from "../utils/directMessageEncryption.js";
import { publishToUser } from "./realtimeService.js";
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

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  const directMessageEncryption = normalizeDirectMessageEncryptionRecord(
    user.directMessageEncryption
  );

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
    directMessageEncryption: directMessageEncryption
      ? {
          ...directMessageEncryption,
          updatedAt: user.directMessageEncryption?.updatedAt || null
        }
      : null,
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

async function listUsersByIdOrder(userIds, { limit } = {}) {
  const safeUserIds = Array.isArray(userIds) ? userIds.map((value) => String(value)) : [];
  const limitedUserIds =
    Number.isInteger(limit) && limit > 0 ? safeUserIds.slice(0, limit) : safeUserIds;

  if (limitedUserIds.length === 0) {
    return [];
  }

  const users = await User.find({
    _id: { $in: limitedUserIds }
  });
  const usersById = new Map(users.map((user) => [String(user._id), user]));

  return limitedUserIds
    .map((userId) => usersById.get(userId) || null)
    .filter(Boolean)
    .map((user) => serializeUser(user));
}

export async function getUserProfile(currentUserId, targetUserId) {
  const [currentUser, targetUser, followerCount] = await Promise.all([
    requireUser(currentUserId),
    requireUser(targetUserId),
    User.countDocuments({
      followingUserIds: targetUserId
    })
  ]);

  return {
    user: serializeUser(targetUser),
    stats: {
      followerCount,
      followingCount: Array.isArray(targetUser.followingUserIds)
        ? targetUser.followingUserIds.length
        : 0,
      isCurrentUser: String(currentUser._id) === String(targetUser._id),
      isFollowing: hasId(currentUser.followingUserIds, targetUser._id)
    }
  };
}

export async function searchUsers(query, { limit } = {}) {
  const normalizedQuery = String(query ?? "").trim();
  const searchFilter = normalizedQuery
    ? {
        $or: [
          { username: { $regex: new RegExp(escapeRegex(normalizedQuery), "i") } },
          { "location.township": { $regex: new RegExp(escapeRegex(normalizedQuery), "i") } },
          { "location.extension": { $regex: new RegExp(escapeRegex(normalizedQuery), "i") } }
        ]
      }
    : {};
  const searchQuery = User.find(searchFilter).sort({ usernameLower: 1 });

  if (Number.isInteger(limit) && limit > 0) {
    searchQuery.limit(limit);
  }

  const users = await searchQuery;
  return users.map((user) => serializeUser(user));
}

export async function getFollowerUsers(userId, { limit } = {}) {
  await requireUser(userId);

  const query = User.find({
    followingUserIds: userId
  }).sort({ usernameLower: 1 });

  if (Number.isInteger(limit) && limit > 0) {
    query.limit(limit);
  }

  const users = await query;
  return users.map((user) => serializeUser(user));
}

export async function getFollowingUsers(userId, { limit } = {}) {
  const user = await requireUser(userId);
  return listUsersByIdOrder(user.followingUserIds, { limit });
}

export async function updateUserProfile(userId, payload = {}) {
  const user = await requireUser(userId, { includePasswordHash: true });
  const previousPhoneNumber = user.phoneNumber;

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
  user.phoneVerified =
    previousPhoneNumber === safePhoneNumber ? user.phoneVerified === true : false;
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

export async function updateDirectMessageEncryptionKey(userId, payload = {}) {
  const user = await requireUser(userId);
  const encryptionRecord = normalizeDirectMessageEncryptionRecord(payload);

  if (!encryptionRecord) {
    throw new AppError("Direct-message encryption key is invalid.", {
      statusCode: 400,
      code: "DIRECT_MESSAGE_ENCRYPTION_INVALID",
      field: "directMessageEncryption"
    });
  }

  user.directMessageEncryption = {
    ...encryptionRecord,
    updatedAt: new Date()
  };
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

  const didFollow = !hasId(currentUser.followingUserIds, targetUser._id);

  if (didFollow) {
    currentUser.followingUserIds.push(targetUser._id);
    await currentUser.save();

    if (targetUser.notificationsEnabled !== false) {
      await Notification.create({
        userId: targetUser._id,
        actorUserId: currentUser._id,
        type: "follow",
        title: "New follower",
        text: ""
      });

      publishToUser(String(targetUser._id), {
        type: "notifications.updated",
        notificationType: "follow"
      });
    }
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
