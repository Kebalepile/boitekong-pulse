export const DIRECT_MESSAGE_E2E_VERSION = "dm-e2e-v1";
export const DIRECT_MESSAGE_E2E_ALGORITHM = "ECDH-P256-AES-GCM-256";
export const DIRECT_MESSAGE_UNAVAILABLE_TEXT =
  "Encrypted message unavailable on this device.";

const BASE64_REGEX = /^[A-Za-z0-9+/=]+$/;
const BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/;

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCompactString(value) {
  return trimString(value).replace(/\s+/g, "");
}

function normalizePublicKeyJwk(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const kty = trimString(value.kty);
  const crv = trimString(value.crv);
  const x = normalizeCompactString(value.x);
  const y = normalizeCompactString(value.y);

  if (
    kty !== "EC" ||
    crv !== "P-256" ||
    !x ||
    !y ||
    !BASE64URL_REGEX.test(x) ||
    !BASE64URL_REGEX.test(y)
  ) {
    return null;
  }

  return {
    kty: "EC",
    crv: "P-256",
    x,
    y,
    ext: true
  };
}

export function normalizeUserDirectMessageEncryption(value) {
  const publicKeyJwk = normalizePublicKeyJwk(value?.publicKeyJwk);
  const keyId = trimString(value?.keyId);

  if (!publicKeyJwk || !keyId) {
    return null;
  }

  return {
    version: DIRECT_MESSAGE_E2E_VERSION,
    algorithm: DIRECT_MESSAGE_E2E_ALGORITHM,
    keyId,
    publicKeyJwk,
    updatedAt:
      typeof value?.updatedAt === "string" && value.updatedAt
        ? value.updatedAt
        : value?.updatedAt instanceof Date
          ? value.updatedAt.toISOString()
          : null
  };
}

export function normalizeMessageEncryptionMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const senderPublicKeyJwk = normalizePublicKeyJwk(value.senderPublicKeyJwk);
  const iv = normalizeCompactString(value.iv);
  const senderKeyId = trimString(value.senderKeyId);
  const recipientKeyId = trimString(value.recipientKeyId);

  if (
    !senderPublicKeyJwk ||
    !iv ||
    !senderKeyId ||
    !recipientKeyId ||
    !BASE64_REGEX.test(iv)
  ) {
    return null;
  }

  return {
    version: DIRECT_MESSAGE_E2E_VERSION,
    algorithm: DIRECT_MESSAGE_E2E_ALGORITHM,
    iv,
    senderKeyId,
    recipientKeyId,
    senderPublicKeyJwk
  };
}
