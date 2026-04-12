import { AppError } from "./appError.js";

const TOWNSHIP_REGEX = /^(?=.{2,40}$)[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;
const EXTENSION_REGEX = /^(?=.{1,12}$)(?:Ext(?:ension)?\.?\s?\d{1,3}|\d{1,3})$/i;
const PHONE_REGEX = /^(?:\+?\d[\d -]{8,18}\d)$/;
export const MAX_POST_CONTENT_LENGTH = 1000;
export const MAX_COMMENT_LENGTH = 300;
export const MAX_REPORT_NOTE_LENGTH = 120;
export const MAX_VOICE_NOTE_DURATION_MS = 60000;
export const MAX_INLINE_IMAGE_BYTES = 1024 * 1024;
const ALLOWED_REACTION_TYPES = new Set(["like", "dislike"]);
const ALLOWED_INLINE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const REPORT_REASONS = [
  "Spam",
  "Harassment or bullying",
  "Hate speech",
  "False information",
  "Violence or threats",
  "Sexual content",
  "Scam or fraud",
  "Other"
];

const COMMON_WEAK_PASSWORDS = new Set([
  "123456",
  "12345678",
  "123456789",
  "1234567890",
  "12345",
  "1234",
  "123",
  "password",
  "password1",
  "password123",
  "admin",
  "admin123",
  "qwerty",
  "qwerty123",
  "abc123",
  "111111",
  "000000",
  "iloveyou",
  "monkey",
  "dragon",
  "letmein",
  "welcome",
  "secret"
]);

function makeValidationError(code, field, message) {
  return new AppError(message, {
    statusCode: 400,
    code,
    field
  });
}

function collapseWhitespace(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function countSpaces(value) {
  return (value.match(/ /g) || []).length;
}

function normalizePassword(value) {
  return String(value ?? "").trim();
}

function normalizePostContent(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function normalizeUsername(value) {
  return collapseWhitespace(value).normalize("NFKC");
}

export function validateUsername(value) {
  const normalized = normalizeUsername(value);

  if (normalized.length < 3 || normalized.length > 30) {
    throw makeValidationError(
      "USERNAME_LENGTH_INVALID",
      "username",
      "Username must be between 3 and 30 characters."
    );
  }

  if (!normalized) {
    throw makeValidationError("USERNAME_BLANK", "username", "Username cannot be blank.");
  }

  if (countSpaces(normalized) > 3) {
    throw makeValidationError(
      "USERNAME_TOO_MANY_SPACES",
      "username",
      "Username can contain a maximum of 3 spaces."
    );
  }

  if (/[<>]/.test(normalized)) {
    throw makeValidationError(
      "USERNAME_INVALID_CHARACTERS",
      "username",
      "Username contains invalid characters."
    );
  }

  return normalized;
}

export function normalizeTownship(value) {
  return collapseWhitespace(value);
}

export function validateTownship(value) {
  const normalized = normalizeTownship(value);

  if (!TOWNSHIP_REGEX.test(normalized)) {
    throw makeValidationError(
      "TOWNSHIP_INVALID",
      "township",
      "Township must be 2-40 letters and may include spaces, apostrophes, or hyphens."
    );
  }

  return normalized;
}

export function normalizeExtension(value) {
  const cleaned = collapseWhitespace(value);

  if (/^\d{1,3}$/i.test(cleaned)) {
    return `Ext ${cleaned}`;
  }

  return cleaned
    .replace(/^extension/i, "Ext")
    .replace(/^ext\.?/i, "Ext")
    .replace(/\s+/g, " ");
}

export function validateExtension(value) {
  const normalized = normalizeExtension(value);

  if (!EXTENSION_REGEX.test(normalized)) {
    throw makeValidationError(
      "EXTENSION_INVALID",
      "extension",
      'Extension must look like "Ext 2" or "2".'
    );
  }

  return normalized;
}

export function normalizePhoneNumber(value) {
  return collapseWhitespace(value).replace(/\s*-\s*/g, "-");
}

export function validatePhoneNumber(value) {
  const normalized = normalizePhoneNumber(value);

  if (!normalized) {
    return "";
  }

  if (!PHONE_REGEX.test(normalized)) {
    throw makeValidationError(
      "PHONE_NUMBER_INVALID",
      "phoneNumber",
      "Phone number must use digits and may include spaces, +, or hyphens."
    );
  }

  return normalized;
}

export function validateRequiredPhoneNumber(value) {
  const normalized = validatePhoneNumber(value);

  if (!normalized) {
    throw makeValidationError(
      "PHONE_NUMBER_REQUIRED",
      "phoneNumber",
      "Phone number is required."
    );
  }

  return normalized;
}

function hasUppercase(value) {
  return /[A-Z]/.test(value);
}

function hasLowercase(value) {
  return /[a-z]/.test(value);
}

function hasNumber(value) {
  return /\d/.test(value);
}

function hasSpecialCharacter(value) {
  return /[^A-Za-z0-9]/.test(value);
}

function hasLongRepeat(value) {
  return /(.)\1{3,}/.test(value);
}

function hasSequentialPattern(value) {
  const lower = value.toLowerCase();
  const sequences = [
    "0123456789",
    "1234567890",
    "abcdefghijklmnopqrstuvwxyz",
    "qwertyuiop",
    "asdfghjkl",
    "zxcvbnm"
  ];

  return sequences.some((sequence) => {
    for (let index = 0; index <= sequence.length - 4; index += 1) {
      if (lower.includes(sequence.slice(index, index + 4))) {
        return true;
      }
    }

    return false;
  });
}

export function validatePassword(value) {
  const normalized = normalizePassword(value);

  if (normalized.length < 12 || normalized.length > 64) {
    throw makeValidationError(
      "PASSWORD_LENGTH_INVALID",
      "password",
      "Password must be between 12 and 64 characters."
    );
  }

  if (!hasUppercase(normalized)) {
    throw makeValidationError(
      "PASSWORD_NO_UPPERCASE",
      "password",
      "Password must include at least one uppercase letter."
    );
  }

  if (!hasLowercase(normalized)) {
    throw makeValidationError(
      "PASSWORD_NO_LOWERCASE",
      "password",
      "Password must include at least one lowercase letter."
    );
  }

  if (!hasNumber(normalized)) {
    throw makeValidationError(
      "PASSWORD_NO_NUMBER",
      "password",
      "Password must include at least one number."
    );
  }

  if (!hasSpecialCharacter(normalized)) {
    throw makeValidationError(
      "PASSWORD_NO_SPECIAL",
      "password",
      "Password must include at least one special character."
    );
  }

  if (COMMON_WEAK_PASSWORDS.has(normalized.toLowerCase())) {
    throw makeValidationError(
      "PASSWORD_TOO_COMMON",
      "password",
      "Password is too common. Choose a stronger password."
    );
  }

  if (hasLongRepeat(normalized)) {
    throw makeValidationError(
      "PASSWORD_TOO_REPETITIVE",
      "password",
      "Password has too many repeated characters."
    );
  }

  if (hasSequentialPattern(normalized)) {
    throw makeValidationError(
      "PASSWORD_TOO_PREDICTABLE",
      "password",
      "Password is too predictable. Avoid obvious sequences."
    );
  }

  return normalized;
}

export function validatePasswordConfirmation(password, confirmPassword) {
  const safePassword = validatePassword(password);
  const safeConfirmPassword = normalizePassword(confirmPassword);

  if (!safeConfirmPassword) {
    throw makeValidationError(
      "PASSWORD_CONFIRM_REQUIRED",
      "confirmPassword",
      "Please confirm your password."
    );
  }

  if (safePassword !== safeConfirmPassword) {
    throw makeValidationError(
      "PASSWORD_CONFIRM_MISMATCH",
      "confirmPassword",
      "Passwords do not match."
    );
  }

  return safePassword;
}

export function validateLoginPassword(value) {
  const normalized = normalizePassword(value);

  if (!normalized) {
    throw makeValidationError(
      "LOGIN_PASSWORD_REQUIRED",
      "password",
      "Enter your password."
    );
  }

  return normalized;
}

export function validateCurrentPassword(value) {
  const normalized = normalizePassword(value);

  if (!normalized) {
    throw makeValidationError(
      "CURRENT_PASSWORD_REQUIRED",
      "currentPassword",
      "Current password is required to change password."
    );
  }

  return normalized;
}

export function validateBoolean(value, field = "value") {
  if (typeof value !== "boolean") {
    throw makeValidationError(
      "BOOLEAN_INVALID",
      field,
      `${field} must be true or false.`
    );
  }

  return value;
}

export function validatePostContent(value) {
  const normalized = normalizePostContent(value);

  if (!normalized) {
    throw makeValidationError("POST_CONTENT_REQUIRED", "content", "Post content is required.");
  }

  if (normalized.length > MAX_POST_CONTENT_LENGTH) {
    throw makeValidationError(
      "POST_CONTENT_TOO_LONG",
      "content",
      `Post content must be ${MAX_POST_CONTENT_LENGTH} characters or fewer.`
    );
  }

  return normalized;
}

export function validateCommentContent(value) {
  const normalized = normalizePostContent(value);

  if (!normalized) {
    throw makeValidationError("COMMENT_CONTENT_REQUIRED", "content", "Comment text is required.");
  }

  if (normalized.length > MAX_COMMENT_LENGTH) {
    throw makeValidationError(
      "COMMENT_CONTENT_TOO_LONG",
      "content",
      `Comment text must be ${MAX_COMMENT_LENGTH} characters or fewer.`
    );
  }

  return normalized;
}

export function validatePostSubmission({ content = "", voiceNote = null }) {
  const normalizedContent = normalizePostContent(content);
  const hasText = Boolean(normalizedContent);
  const hasVoiceNote = Boolean(
    typeof voiceNote?.audioBase64 === "string" && voiceNote.audioBase64.trim()
  ) || Boolean(
    typeof voiceNote?.url === "string" &&
      /^https?:\/\//i.test(voiceNote.url.trim())
  );

  if (!hasText && !hasVoiceNote) {
    throw makeValidationError(
      "POST_BODY_REQUIRED",
      "content",
      "Add text or record a voice note."
    );
  }

  return {
    content: hasText ? validatePostContent(normalizedContent) : "",
    voiceNote: hasVoiceNote ? voiceNote : null
  };
}

export function validateCommentSubmission({ content = "", voiceNote = null }) {
  const normalizedContent = normalizePostContent(content);
  const hasText = Boolean(normalizedContent);
  const hasVoiceNote = Boolean(
    typeof voiceNote?.audioBase64 === "string" && voiceNote.audioBase64.trim()
  ) || Boolean(
    typeof voiceNote?.url === "string" &&
      /^https?:\/\//i.test(voiceNote.url.trim())
  );

  if (hasText && hasVoiceNote) {
    throw makeValidationError(
      "COMMENT_MODE_CONFLICT",
      "content",
      "Choose text or voice note, not both."
    );
  }

  if (!hasText && !hasVoiceNote) {
    throw makeValidationError(
      "COMMENT_BODY_REQUIRED",
      "content",
      "Add text or record a voice note."
    );
  }

  return hasText
    ? {
        content: validateCommentContent(normalizedContent),
        voiceNote: null
      }
    : {
        content: "",
        voiceNote
      };
}

export function validateReactionType(value) {
  const reactionType = typeof value === "string" ? value.trim() : "";

  if (!ALLOWED_REACTION_TYPES.has(reactionType)) {
    throw makeValidationError("REACTION_INVALID", "reactionType", "Invalid reaction type.");
  }

  return reactionType;
}

export function validateReportReason(value) {
  const reason = collapseWhitespace(String(value ?? ""));

  if (!REPORT_REASONS.includes(reason)) {
    throw makeValidationError(
      "REPORT_REASON_INVALID",
      "reason",
      "Choose a valid report reason."
    );
  }

  return reason;
}

export function validateReportNote(value, reason) {
  const note = String(value ?? "").trim();

  if (reason !== "Other") {
    return "";
  }

  if (!note) {
    throw makeValidationError(
      "REPORT_NOTE_REQUIRED",
      "note",
      "Tell us what you are reporting."
    );
  }

  if (note.length > MAX_REPORT_NOTE_LENGTH) {
    throw makeValidationError(
      "REPORT_NOTE_TOO_LONG",
      "note",
      `Report note must be ${MAX_REPORT_NOTE_LENGTH} characters or fewer.`
    );
  }

  return note;
}

export function validateImageUrl(value, field = "image") {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return "";
  }

  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)) {
    return normalizeInlineImageDataUrl(trimmed, {
      field,
      maxBytes: MAX_INLINE_IMAGE_BYTES
    });
  }

  try {
    const url = new URL(trimmed);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw makeValidationError(
        "IMAGE_URL_INVALID_PROTOCOL",
        field,
        "Only http and https image URLs are allowed."
      );
    }

    return url.toString();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw makeValidationError("IMAGE_URL_INVALID", field, "Image URL is invalid.");
  }
}

export function normalizeAvatarUrl(value) {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return "";
  }

  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)) {
    return normalizeInlineImageDataUrl(trimmed, {
      field: "avatarUrl",
      maxBytes: MAX_INLINE_IMAGE_BYTES
    });
  }

  try {
    const url = new URL(trimmed);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw makeValidationError(
        "AVATAR_URL_INVALID_PROTOCOL",
        "avatarUrl",
        "Avatar URL must use http or https."
      );
    }

    return url.toString();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw makeValidationError(
      "AVATAR_URL_INVALID",
      "avatarUrl",
      "Avatar URL is invalid."
    );
  }
}

function normalizeInlineImageDataUrl(
  value,
  { field = "image", maxBytes = MAX_INLINE_IMAGE_BYTES } = {}
) {
  const trimmed = String(value ?? "").trim();
  const match = trimmed.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i);

  if (!match) {
    throw makeValidationError("IMAGE_DATA_INVALID", field, "Image data is invalid.");
  }

  const mimeType = match[1].toLowerCase();

  if (!ALLOWED_INLINE_IMAGE_TYPES.has(mimeType)) {
    throw makeValidationError(
      "IMAGE_DATA_TYPE_INVALID",
      field,
      "Only PNG, JPG, and WEBP images are supported."
    );
  }

  const base64Payload = match[2];
  const paddingLength = (base64Payload.match(/=+$/)?.[0].length || 0);
  const sizeBytes = Math.floor((base64Payload.length * 3) / 4) - paddingLength;

  if (sizeBytes > maxBytes) {
    throw makeValidationError(
      "IMAGE_DATA_TOO_LARGE",
      field,
      `Image must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller after compression.`
    );
  }

  return trimmed;
}
