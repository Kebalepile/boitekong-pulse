import { STORAGE_KEYS } from "../config/storageKeys.js";
import { storage } from "../storage/storage.js";
import { apiRequest } from "./apiClient.js";
import {
  DIRECT_MESSAGE_E2E_ALGORITHM,
  DIRECT_MESSAGE_E2E_VERSION,
  DIRECT_MESSAGE_UNAVAILABLE_TEXT,
  normalizeMessageEncryptionMetadata,
  normalizeUserDirectMessageEncryption
} from "../utils/directMessageEncryption.js";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMessageText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function getWebCrypto() {
  return globalThis.crypto?.subtle || null;
}

function normalizePublicKeyForStorage(publicKeyJwk) {
  return normalizeUserDirectMessageEncryption({
    keyId: "temporary",
    publicKeyJwk
  })?.publicKeyJwk || null;
}

export function supportsDirectMessageEncryption() {
  return (
    Boolean(getWebCrypto()) &&
    typeof globalThis.TextEncoder !== "undefined" &&
    typeof globalThis.TextDecoder !== "undefined" &&
    typeof globalThis.btoa === "function" &&
    typeof globalThis.atob === "function"
  );
}

function getStoredKeyMap() {
  const rawValue = storage.get(STORAGE_KEYS.DIRECT_MESSAGE_E2E_KEYS, {});
  return rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
    ? rawValue
    : {};
}

function saveStoredKeyMap(keyMap) {
  storage.set(STORAGE_KEYS.DIRECT_MESSAGE_E2E_KEYS, keyMap);
}

function getStoredKeyRecord(userId) {
  const safeUserId = trimString(userId);

  if (!safeUserId) {
    return null;
  }

  const keyRecord = getStoredKeyMap()[safeUserId];

  if (!keyRecord || typeof keyRecord !== "object") {
    return null;
  }

  const normalizedPublicKey = normalizeUserDirectMessageEncryption({
    keyId: keyRecord.keyId,
    publicKeyJwk: keyRecord.publicKeyJwk
  });
  const privateKeyJwk =
    keyRecord.privateKeyJwk && typeof keyRecord.privateKeyJwk === "object"
      ? keyRecord.privateKeyJwk
      : null;

  if (!normalizedPublicKey || !privateKeyJwk) {
    return null;
  }

  return {
    version: DIRECT_MESSAGE_E2E_VERSION,
    algorithm: DIRECT_MESSAGE_E2E_ALGORITHM,
    keyId: normalizedPublicKey.keyId,
    publicKeyJwk: normalizedPublicKey.publicKeyJwk,
    privateKeyJwk
  };
}

function setStoredKeyRecord(userId, keyRecord) {
  const safeUserId = trimString(userId);

  if (!safeUserId || !keyRecord) {
    return;
  }

  const nextKeyMap = {
    ...getStoredKeyMap(),
    [safeUserId]: {
      version: DIRECT_MESSAGE_E2E_VERSION,
      algorithm: DIRECT_MESSAGE_E2E_ALGORITHM,
      keyId: keyRecord.keyId,
      publicKeyJwk: keyRecord.publicKeyJwk,
      privateKeyJwk: keyRecord.privateKeyJwk
    }
  };

  saveStoredKeyMap(nextKeyMap);
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortObjectKeys(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = sortObjectKeys(value[key]);
      return result;
    }, {});
}

async function digestText(value) {
  const subtle = getWebCrypto();
  const encoder = new TextEncoder();
  const digestBuffer = await subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digestBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function createKeyId(publicKeyJwk) {
  return `dmk_${(await digestText(JSON.stringify(sortObjectKeys(publicKeyJwk)))).slice(0, 24)}`;
}

async function generateDirectMessageKeyRecord() {
  const subtle = getWebCrypto();
  const keyPair = await subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    true,
    ["deriveKey"]
  );
  const [publicKeyJwk, privateKeyJwk] = await Promise.all([
    subtle.exportKey("jwk", keyPair.publicKey),
    subtle.exportKey("jwk", keyPair.privateKey)
  ]);
  const normalizedPublicKey = normalizePublicKeyForStorage(publicKeyJwk);

  if (!normalizedPublicKey) {
    throw new Error("Could not prepare the direct-message encryption key.");
  }

  const keyId = await createKeyId(normalizedPublicKey);

  return {
    version: DIRECT_MESSAGE_E2E_VERSION,
    algorithm: DIRECT_MESSAGE_E2E_ALGORITHM,
    keyId,
    publicKeyJwk: normalizedPublicKey,
    privateKeyJwk
  };
}

async function importPublicKey(publicKeyJwk) {
  return getWebCrypto().importKey(
    "jwk",
    publicKeyJwk,
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    false,
    []
  );
}

async function importPrivateKey(privateKeyJwk) {
  return getWebCrypto().importKey(
    "jwk",
    privateKeyJwk,
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    false,
    ["deriveKey"]
  );
}

async function deriveSharedKey({ privateKeyJwk, publicKeyJwk, usages }) {
  const [privateKey, publicKey] = await Promise.all([
    importPrivateKey(privateKeyJwk),
    importPublicKey(publicKeyJwk)
  ]);

  return getWebCrypto().deriveKey(
    {
      name: "ECDH",
      public: publicKey
    },
    privateKey,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    usages
  );
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return globalThis.btoa(binary);
}

function base64ToUint8Array(value) {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function resolveConversationPartner(conversation, currentUserId) {
  if (!conversation || !currentUserId) {
    return null;
  }

  return Array.isArray(conversation.participants)
    ? conversation.participants.find((participant) => participant.id !== currentUserId) || null
    : null;
}

async function uploadDirectMessageKeyRecord(keyRecord) {
  const response = await apiRequest("/users/me/direct-message-key", {
    method: "PUT",
    body: {
      keyId: keyRecord.keyId,
      publicKeyJwk: keyRecord.publicKeyJwk
    }
  });

  return response.user || null;
}

export async function ensureDirectMessageEncryptionSession({
  user,
  onUserUpdated
} = {}) {
  if (!supportsDirectMessageEncryption() || !user?.id) {
    return user || null;
  }

  let keyRecord = getStoredKeyRecord(user.id);

  if (!keyRecord) {
    keyRecord = await generateDirectMessageKeyRecord();
    setStoredKeyRecord(user.id, keyRecord);
  }

  const remoteEncryption = normalizeUserDirectMessageEncryption(
    user.directMessageEncryption
  );
  const keyAlreadyRegistered =
    remoteEncryption &&
    remoteEncryption.keyId === keyRecord.keyId &&
    JSON.stringify(remoteEncryption.publicKeyJwk) === JSON.stringify(keyRecord.publicKeyJwk);

  if (keyAlreadyRegistered) {
    return user;
  }

  const updatedUser = await uploadDirectMessageKeyRecord(keyRecord);

  if (!updatedUser) {
    return user;
  }

  if (typeof onUserUpdated === "function") {
    return onUserUpdated(updatedUser);
  }

  return updatedUser;
}

export async function encryptDirectMessageText({
  conversation,
  currentUser,
  text
} = {}) {
  const normalizedText = normalizeMessageText(text);

  if (!normalizedText || !currentUser?.id || !conversation) {
    return {
      text: normalizedText,
      encryptedText: "",
      encryption: null
    };
  }

  const recipient = resolveConversationPartner(conversation, currentUser.id);
  const recipientEncryption = normalizeUserDirectMessageEncryption(
    recipient?.directMessageEncryption
  );
  const senderKeyRecord = getStoredKeyRecord(currentUser.id);

  if (!recipientEncryption || !senderKeyRecord) {
    return {
      text: normalizedText,
      encryptedText: "",
      encryption: null
    };
  }

  const sharedKey = await deriveSharedKey({
    privateKeyJwk: senderKeyRecord.privateKeyJwk,
    publicKeyJwk: recipientEncryption.publicKeyJwk,
    usages: ["encrypt"]
  });
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encryptedBuffer = await getWebCrypto().encrypt(
    {
      name: "AES-GCM",
      iv
    },
    sharedKey,
    encoder.encode(normalizedText)
  );

  return {
    text: "",
    encryptedText: arrayBufferToBase64(encryptedBuffer),
    encryption: {
      version: DIRECT_MESSAGE_E2E_VERSION,
      algorithm: DIRECT_MESSAGE_E2E_ALGORITHM,
      iv: arrayBufferToBase64(iv),
      senderKeyId: senderKeyRecord.keyId,
      recipientKeyId: recipientEncryption.keyId,
      senderPublicKeyJwk: senderKeyRecord.publicKeyJwk
    }
  };
}

async function decryptDirectMessageText({
  conversation,
  currentUserId,
  message
}) {
  const encryption = normalizeMessageEncryptionMetadata(message?.encryption);
  const encryptedText = trimString(message?.encryptedText);
  const keyRecord = getStoredKeyRecord(currentUserId);

  if (!encryption || !encryptedText || !keyRecord) {
    return DIRECT_MESSAGE_UNAVAILABLE_TEXT;
  }

  const conversationPartner = resolveConversationPartner(conversation, currentUserId);
  const partnerEncryption = normalizeUserDirectMessageEncryption(
    conversationPartner?.directMessageEncryption
  );
  const publicKeyJwk =
    message.senderId === currentUserId
      ? partnerEncryption?.publicKeyJwk || null
      : encryption.senderPublicKeyJwk;

  if (!publicKeyJwk) {
    return DIRECT_MESSAGE_UNAVAILABLE_TEXT;
  }

  try {
    const sharedKey = await deriveSharedKey({
      privateKeyJwk: keyRecord.privateKeyJwk,
      publicKeyJwk,
      usages: ["decrypt"]
    });
    const decryptedBuffer = await getWebCrypto().decrypt(
      {
        name: "AES-GCM",
        iv: base64ToUint8Array(encryption.iv)
      },
      sharedKey,
      base64ToUint8Array(encryptedText)
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch {
    return DIRECT_MESSAGE_UNAVAILABLE_TEXT;
  }
}

export async function decryptConversationMessages(conversation, currentUserId) {
  if (
    !supportsDirectMessageEncryption() ||
    !conversation ||
    !Array.isArray(conversation.messages) ||
    !currentUserId
  ) {
    return conversation;
  }

  const decryptedMessages = await Promise.all(
    conversation.messages.map(async (message) => {
      if (!trimString(message?.encryptedText) || !message?.encryption) {
        return {
          ...message,
          isEndToEndEncrypted: false
        };
      }

      return {
        ...message,
        text: await decryptDirectMessageText({
          conversation,
          currentUserId,
          message
        }),
        isEndToEndEncrypted: true
      };
    })
  );

  return {
    ...conversation,
    messages: decryptedMessages
  };
}
