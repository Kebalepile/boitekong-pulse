export const DIRECT_MESSAGE_E2E_VERSION = "dm-e2e-v1";
export const DIRECT_MESSAGE_E2E_ALGORITHM = "ECDH-P256-AES-GCM-256";
export const DIRECT_MESSAGE_E2E_PRIVATE_KEY_WRAP_VERSION = "dm-e2e-wrap-v1";
export const DIRECT_MESSAGE_E2E_PRIVATE_KEY_WRAP_ALGORITHM = "PBKDF2-SHA-256-AES-GCM-256";

const BASE64_REGEX = /^[A-Za-z0-9+/=]+$/;
const BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/;

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCompactString(value) {
  return trimString(value).replace(/\s+/g, "");
}

export function normalizeDirectMessagePublicKeyJwk(value) {
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

export function normalizeDirectMessagePrivateKeyEnvelope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const ciphertext = normalizeCompactString(value.ciphertext);
  const iv = normalizeCompactString(value.iv);
  const salt = normalizeCompactString(value.salt);
  const iterations = Number.parseInt(value.iterations, 10);

  if (
    !ciphertext ||
    !iv ||
    !salt ||
    !Number.isInteger(iterations) ||
    iterations <= 0 ||
    !BASE64_REGEX.test(ciphertext) ||
    !BASE64_REGEX.test(iv) ||
    !BASE64_REGEX.test(salt)
  ) {
    return null;
  }

  return {
    version: DIRECT_MESSAGE_E2E_PRIVATE_KEY_WRAP_VERSION,
    algorithm: DIRECT_MESSAGE_E2E_PRIVATE_KEY_WRAP_ALGORITHM,
    ciphertext,
    iv,
    salt,
    iterations
  };
}

function normalizeDirectMessageKeyRecord(value, options = {}) {
  const publicKeyJwk = normalizeDirectMessagePublicKeyJwk(value?.publicKeyJwk);
  const keyId = trimString(value?.keyId);
  const privateKeyEnvelope = normalizeDirectMessagePrivateKeyEnvelope(
    value?.privateKeyEnvelope
  );

  if (
    !publicKeyJwk ||
    !keyId ||
    (options.requirePrivateKeyEnvelope === true && !privateKeyEnvelope)
  ) {
    return null;
  }

  return {
    version: DIRECT_MESSAGE_E2E_VERSION,
    algorithm: DIRECT_MESSAGE_E2E_ALGORITHM,
    keyId,
    publicKeyJwk,
    privateKeyEnvelope,
    updatedAt: value?.updatedAt instanceof Date ? value.updatedAt : null
  };
}

export function normalizeDirectMessageEncryptionRecord(value, options = {}) {
  const primaryKeyRecord = normalizeDirectMessageKeyRecord(value, options);

  if (!primaryKeyRecord) {
    return null;
  }

  const previousKeys = Array.isArray(value?.previousKeys)
    ? value.previousKeys
        .map((entry) => normalizeDirectMessageKeyRecord(entry, options))
        .filter(Boolean)
        .filter((entry, index, entries) => {
          if (entry.keyId === primaryKeyRecord.keyId) {
            return false;
          }

          return entries.findIndex((candidate) => candidate.keyId === entry.keyId) === index;
        })
    : [];

  return {
    ...primaryKeyRecord,
    previousKeys
  };
}

export function normalizeEncryptedMessageText(value) {
  const encryptedText = normalizeCompactString(value);
  return encryptedText && BASE64_REGEX.test(encryptedText) ? encryptedText : "";
}

export function normalizeMessageEncryptionPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const senderPublicKeyJwk = normalizeDirectMessagePublicKeyJwk(value.senderPublicKeyJwk);
  const recipientPublicKeyJwk =
    value.recipientPublicKeyJwk === undefined
      ? null
      : normalizeDirectMessagePublicKeyJwk(value.recipientPublicKeyJwk);
  const iv = normalizeCompactString(value.iv);
  const senderKeyId = trimString(value.senderKeyId);
  const recipientKeyId = trimString(value.recipientKeyId);

  if (
    !senderPublicKeyJwk ||
    (value.recipientPublicKeyJwk !== undefined && !recipientPublicKeyJwk) ||
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
    senderPublicKeyJwk,
    recipientPublicKeyJwk
  };
}
