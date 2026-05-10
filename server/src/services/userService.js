import bcrypt from "bcryptjs";
import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/appError.js";
import {
  createInlineAvatarDataUrl,
  deleteStoredAvatar
} from "../utils/avatarUploads.js";
import { normalizeDirectMessageEncryptionRecord } from "../utils/directMessageEncryption.js";
import { publishToUser } from "./realtimeService.js";
import {
  normalizeAvatarUrl,
  validateArea,
  validateBoolean,
  validateCurrentPassword,
  validateExtension,
  validateMunicipality,
  validatePasswordConfirmation,
  validateProvince,
  validateRequiredPhoneNumber,
  validateStreetName,
  validateTownship,
  validateUsername
} from "../utils/validators.js";

function serializeLocation(location = {}, { includeStreetName = false } = {}) {
  const area = location.area || location.extension || "";

  return {
    province: location.province || "",
    municipality: location.municipality || "",
    township: location.township || "",
    extension: location.extension || area,
    area,
    streetName: includeStreetName ? location.streetName || "" : ""
  };
}

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

function serializeDirectMessageKeyRecord(keyRecord, { includePrivateEncryption = false } = {}) {
  if (!keyRecord) {
    return null;
  }

  return {
    version: keyRecord.version,
    algorithm: keyRecord.algorithm,
    keyId: keyRecord.keyId,
    publicKeyJwk: keyRecord.publicKeyJwk,
    ...(includePrivateEncryption
      ? {
          privateKeyEnvelope: keyRecord.privateKeyEnvelope
        }
      : {}),
    updatedAt: keyRecord.updatedAt || null
  };
}

function toDirectMessageKeyHistoryEntry(keyRecord, updatedAt = null) {
  if (!keyRecord) {
    return null;
  }

  return {
    version: keyRecord.version,
    algorithm: keyRecord.algorithm,
    keyId: keyRecord.keyId,
    publicKeyJwk: keyRecord.publicKeyJwk,
    privateKeyEnvelope: keyRecord.privateKeyEnvelope,
    updatedAt: updatedAt || keyRecord.updatedAt || null
  };
}

function mergeDirectMessageEncryptionHistory(existingRecord, nextRecord) {
  if (!nextRecord) {
    return null;
  }

  const mergedPreviousKeys = [];
  const seenKeyIds = new Set([nextRecord.keyId]);
  const appendPreviousKey = (entry) => {
    const normalizedEntry = toDirectMessageKeyHistoryEntry(entry);

    if (!normalizedEntry || seenKeyIds.has(normalizedEntry.keyId)) {
      return;
    }

    seenKeyIds.add(normalizedEntry.keyId);
    mergedPreviousKeys.push(normalizedEntry);
  };
  const normalizedExistingRecord = normalizeDirectMessageEncryptionRecord(existingRecord);

  nextRecord.previousKeys.forEach(appendPreviousKey);

  if (normalizedExistingRecord) {
    appendPreviousKey(
      toDirectMessageKeyHistoryEntry(
        normalizedExistingRecord,
        existingRecord?.updatedAt || normalizedExistingRecord.updatedAt || null
      )
    );
    normalizedExistingRecord.previousKeys.forEach(appendPreviousKey);
  }

  return {
    ...nextRecord,
    previousKeys: mergedPreviousKeys
  };
}

export function serializeUser(user, options = {}) {
  const includePrivateEncryption = options.includePrivateEncryption === true;
  const directMessageEncryption = normalizeDirectMessageEncryptionRecord(
    user.directMessageEncryption
  );
  const serializedDirectMessageEncryption = directMessageEncryption
    ? {
        ...serializeDirectMessageKeyRecord(
          {
            ...directMessageEncryption,
            updatedAt: user.directMessageEncryption?.updatedAt || null
          },
          { includePrivateEncryption }
        ),
        previousKeys: directMessageEncryption.previousKeys.map((entry) =>
          serializeDirectMessageKeyRecord(entry, { includePrivateEncryption })
        )
      }
    : null;

  return {
    id: String(user._id),
    username: user.username,
    phoneNumber: user.phoneNumber,
    avatarUrl: user.avatarUrl || "",
    location: serializeLocation(user.location, {
      includeStreetName: includePrivateEncryption
    }),
    directMessagesEnabled: user.directMessagesEnabled !== false,
    notificationsEnabled: user.notificationsEnabled !== false,
    directMessageEncryption: serializedDirectMessageEncryption,
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
    user: serializeUser(targetUser, {
      includePrivateEncryption: String(currentUser._id) === String(targetUser._id)
    }),
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
          { "location.province": { $regex: new RegExp(escapeRegex(normalizedQuery), "i") } },
          { "location.municipality": { $regex: new RegExp(escapeRegex(normalizedQuery), "i") } },
          { "location.township": { $regex: new RegExp(escapeRegex(normalizedQuery), "i") } },
          { "location.extension": { $regex: new RegExp(escapeRegex(normalizedQuery), "i") } },
          { "location.area": { $regex: new RegExp(escapeRegex(normalizedQuery), "i") } }
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
  const wantsPasswordChange =
    String(payload.newPassword ?? "").trim() || String(payload.confirmNewPassword ?? "").trim();
  const user = await requireUser(userId, { includePasswordHash: Boolean(wantsPasswordChange) });
  const previousPhoneNumber = user.phoneNumber;
  const previousAvatarUrl = user.avatarUrl || "";
  const wantsDirectMessageEncryptionUpdate = payload.directMessageEncryption !== undefined;
  const nextDirectMessageEncryption = wantsDirectMessageEncryptionUpdate
    ? normalizeDirectMessageEncryptionRecord(payload.directMessageEncryption, {
        requirePrivateKeyEnvelope: true
      })
    : null;

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
  const safeProvince =
    payload.province === undefined
      ? user.location?.province || ""
      : validateProvince(payload.province);
  const safeMunicipality =
    payload.municipality === undefined
      ? user.location?.municipality || ""
      : validateMunicipality(payload.municipality);
  const safeArea =
    payload.area === undefined
      ? user.location?.area || safeExtension
      : validateArea(payload.area);
  const safeStreetName =
    payload.streetName === undefined
      ? user.location?.streetName || ""
      : validateStreetName(payload.streetName);
  const safeAvatarUrl =
    payload.avatarUrl === undefined
      ? user.avatarUrl || ""
      : normalizeAvatarUrl(payload.avatarUrl);

  const usernameChanged = safeUsername.toLowerCase() !== user.usernameLower;
  const phoneNumberChanged = safePhoneNumber !== previousPhoneNumber;
  const [usernameOwner, phoneOwner] = await Promise.all([
    usernameChanged
      ? User.findOne({
          usernameLower: safeUsername.toLowerCase(),
          _id: { $ne: user._id }
        })
      : null,
    phoneNumberChanged
      ? User.findOne({
          phoneNumber: safePhoneNumber,
          _id: { $ne: user._id }
        })
      : null
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

  if (wantsDirectMessageEncryptionUpdate && !nextDirectMessageEncryption) {
    throw new AppError("Direct-message encryption bundle is invalid.", {
      statusCode: 400,
      code: "DIRECT_MESSAGE_ENCRYPTION_INVALID",
      field: "directMessageEncryption"
    });
  }

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

    if (user.directMessageEncryption && !nextDirectMessageEncryption) {
      throw new AppError(
        "Could not refresh your direct-message encryption key. Sign in again and try once more.",
        {
          statusCode: 400,
          code: "DIRECT_MESSAGE_ENCRYPTION_REWRAP_REQUIRED",
          field: "newPassword"
        }
      );
    }

    user.passwordHash = await bcrypt.hash(safePassword, 12);
  }

  user.username = safeUsername;
  user.usernameLower = safeUsername.toLowerCase();
  user.phoneNumber = safePhoneNumber;
  user.avatarUrl = safeAvatarUrl;
  user.phoneVerified =
    previousPhoneNumber === safePhoneNumber ? user.phoneVerified === true : false;
  user.location = {
    province: safeProvince,
    municipality: safeMunicipality,
    township: safeTownship,
    extension: safeExtension,
    area: safeArea,
    streetName: safeStreetName
  };

  if (wantsDirectMessageEncryptionUpdate) {
    user.directMessageEncryption = {
      ...mergeDirectMessageEncryptionHistory(
        user.directMessageEncryption,
        nextDirectMessageEncryption
      ),
      updatedAt: new Date()
    };
  }

  await user.save();

  if (previousAvatarUrl && previousAvatarUrl !== safeAvatarUrl) {
    await deleteStoredAvatar(previousAvatarUrl);
  }

  return serializeUser(user, { includePrivateEncryption: true });
}

export async function updateUserAvatar(userId, { fileBuffer, mimeType } = {}) {
  const user = await requireUser(userId);
  const previousAvatarUrl = user.avatarUrl || "";
  const nextAvatarUrl = createInlineAvatarDataUrl({
    fileBuffer,
    mimeType
  });

  user.avatarUrl = nextAvatarUrl;
  await user.save();

  if (previousAvatarUrl && previousAvatarUrl !== nextAvatarUrl) {
    await deleteStoredAvatar(previousAvatarUrl);
  }

  return serializeUser(user, { includePrivateEncryption: true });
}

export async function deleteUserAvatar(userId) {
  const user = await requireUser(userId);
  const previousAvatarUrl = user.avatarUrl || "";

  if (!previousAvatarUrl) {
    return serializeUser(user, { includePrivateEncryption: true });
  }

  user.avatarUrl = "";
  await user.save();
  await deleteStoredAvatar(previousAvatarUrl);

  return serializeUser(user, { includePrivateEncryption: true });
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

  return serializeUser(user, { includePrivateEncryption: true });
}

export async function updateDirectMessageEncryptionKey(userId, payload = {}) {
  const user = await requireUser(userId);
  const encryptionRecord = normalizeDirectMessageEncryptionRecord(payload, {
    requirePrivateKeyEnvelope: true
  });

  if (!encryptionRecord) {
    throw new AppError("Direct-message encryption key is invalid.", {
      statusCode: 400,
      code: "DIRECT_MESSAGE_ENCRYPTION_INVALID",
      field: "directMessageEncryption"
    });
  }

  user.directMessageEncryption = {
    ...mergeDirectMessageEncryptionHistory(user.directMessageEncryption, encryptionRecord),
    updatedAt: new Date()
  };
  await user.save();

  return serializeUser(user, { includePrivateEncryption: true });
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
    user: serializeUser(currentUser, { includePrivateEncryption: true }),
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
    user: serializeUser(currentUser, { includePrivateEncryption: true }),
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
    user: serializeUser(currentUser, { includePrivateEncryption: true }),
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
    user: serializeUser(currentUser, { includePrivateEncryption: true }),
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
