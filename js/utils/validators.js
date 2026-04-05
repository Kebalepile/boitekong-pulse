const TOWNSHIP_REGEX = /^(?=.{2,40}$)[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;
const EXTENSION_REGEX = /^(?=.{1,12}$)(?:Ext(?:ension)?\.?\s?\d{1,3}|\d{1,3})$/i;
export const MAX_AVATAR_FILE_BYTES = 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

function collapseWhitespace(value) {
  return value.trim().replace(/\s+/g, " ");
}

function countSpaces(value) {
  return (value.match(/ /g) || []).length;
}

function makeError(code, field, message) {
  const error = new Error(message);
  error.code = code;
  error.field = field;
  return error;
}

export function normalizeUsername(value) {
  return collapseWhitespace(value).normalize("NFKC");
}

export function normalizeTownship(value) {
  return collapseWhitespace(value);
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

export function normalizePassword(value) {
  return value.trim();
}

export function normalizePostContent(value) {
  return value.replace(/\r\n/g, "\n").trim();
}

export function validateUsername(value) {
  const normalized = normalizeUsername(value);

  if (normalized.length < 3 || normalized.length > 30) {
    throw makeError(
      "USERNAME_LENGTH_INVALID",
      "username",
      "Username must be between 3 and 30 characters."
    );
  }

  if (!normalized.trim()) {
    throw makeError("USERNAME_BLANK", "username", "Username cannot be blank.");
  }

  if (countSpaces(normalized) > 3) {
    throw makeError(
      "USERNAME_TOO_MANY_SPACES",
      "username",
      "Username can contain a maximum of 3 spaces."
    );
  }

  if (/[<>]/.test(normalized)) {
    throw makeError(
      "USERNAME_INVALID_CHARACTERS",
      "username",
      "Username contains invalid characters."
    );
  }

  return normalized;
}

export function validateTownship(value) {
  const normalized = normalizeTownship(value);

  if (!TOWNSHIP_REGEX.test(normalized)) {
    throw makeError(
      "TOWNSHIP_INVALID",
      "township",
      "Township must be 2-40 letters and may include spaces, apostrophes, or hyphens."
    );
  }

  return normalized;
}

export function validateExtension(value) {
  const normalized = normalizeExtension(value);

  if (!EXTENSION_REGEX.test(normalized)) {
    throw makeError(
      "EXTENSION_INVALID",
      "extension",
      'Extension must look like "Ext 2" or "2".'
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
    for (let i = 0; i <= sequence.length - 4; i += 1) {
      const slice = sequence.slice(i, i + 4);
      if (lower.includes(slice)) return true;
    }
    return false;
  });
}

export function validatePassword(value) {
  const normalized = normalizePassword(value);

  if (normalized.length < 12 || normalized.length > 64) {
    throw makeError(
      "PASSWORD_LENGTH_INVALID",
      "password",
      "Password must be between 12 and 64 characters."
    );
  }

  if (!hasUppercase(normalized)) {
    throw makeError(
      "PASSWORD_NO_UPPERCASE",
      "password",
      "Password must include at least one uppercase letter."
    );
  }

  if (!hasLowercase(normalized)) {
    throw makeError(
      "PASSWORD_NO_LOWERCASE",
      "password",
      "Password must include at least one lowercase letter."
    );
  }

  if (!hasNumber(normalized)) {
    throw makeError(
      "PASSWORD_NO_NUMBER",
      "password",
      "Password must include at least one number."
    );
  }

  if (!hasSpecialCharacter(normalized)) {
    throw makeError(
      "PASSWORD_NO_SPECIAL",
      "password",
      "Password must include at least one special character."
    );
  }

  if (COMMON_WEAK_PASSWORDS.has(normalized.toLowerCase())) {
    throw makeError(
      "PASSWORD_TOO_COMMON",
      "password",
      "Password is too common. Choose a stronger password."
    );
  }

  if (hasLongRepeat(normalized)) {
    throw makeError(
      "PASSWORD_TOO_REPETITIVE",
      "password",
      "Password has too many repeated characters."
    );
  }

  if (hasSequentialPattern(normalized)) {
    throw makeError(
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
    throw makeError(
      "PASSWORD_CONFIRM_REQUIRED",
      "confirmPassword",
      "Please confirm your password."
    );
  }

  if (safePassword !== safeConfirmPassword) {
    throw makeError(
      "PASSWORD_CONFIRM_MISMATCH",
      "confirmPassword",
      "Passwords do not match."
    );
  }

  return safePassword;
}

export function validateCurrentPassword(value) {
  const normalized = normalizePassword(value);

  if (!normalized) {
    throw makeError(
      "CURRENT_PASSWORD_REQUIRED",
      "currentPassword",
      "Current password is required to change password."
    );
  }

  return normalized;
}

export function validatePostContent(value) {
  const normalized = normalizePostContent(value);

  if (!normalized) {
    throw makeError("POST_CONTENT_REQUIRED", "content", "Post content is required.");
  }

  if (normalized.length > 1000) {
    throw makeError(
      "POST_CONTENT_TOO_LONG",
      "content",
      "Post content must be 1000 characters or fewer."
    );
  }

  return normalized;
}

export function validateCommentSubmission({ content = "", voiceNote = null, mode = null }) {
  const hasVoiceNote = Boolean(voiceNote?.dataUrl);
  const normalizedContent = normalizePostContent(content || "");
  const hasText = Boolean(normalizedContent);

  if (mode === "voice") {
    if (!hasVoiceNote) {
      throw makeError(
        "COMMENT_VOICE_REQUIRED",
        "content",
        "Record a voice note before posting."
      );
    }

    return {
      content: "",
      voiceNote
    };
  }

  if (mode === "text") {
    return {
      content: validatePostContent(content),
      voiceNote: null
    };
  }

  if (hasText && hasVoiceNote) {
    throw makeError(
      "COMMENT_MODE_CONFLICT",
      "content",
      "Choose text or voice note, not both."
    );
  }

  if (!hasText && !hasVoiceNote) {
    throw makeError(
      "COMMENT_BODY_REQUIRED",
      "content",
      "Add text or record a voice note."
    );
  }

  return hasText
    ? {
        content: validatePostContent(content),
        voiceNote: null
      }
    : {
        content: "",
        voiceNote
      };
}

export function validateImageUrl(value) {
  const trimmed = value.trim();

  if (!trimmed) return "";

  try {
    const url = new URL(trimmed, window.location.origin);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw makeError(
        "IMAGE_URL_INVALID_PROTOCOL",
        "image",
        "Only http and https image URLs are allowed."
      );
    }

    return url.toString();
  } catch (error) {
    if (error.code) throw error;
    throw makeError("IMAGE_URL_INVALID", "image", "Image URL is invalid.");
  }
}

export function validateAvatarFile(file) {
  if (!file) {
    return null;
  }

  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    throw makeError(
      "AVATAR_TYPE_INVALID",
      "avatar",
      "Profile photo must be a PNG, JPG, or WEBP image."
    );
  }

  if (file.size > MAX_AVATAR_FILE_BYTES) {
    throw makeError(
      "AVATAR_TOO_LARGE",
      "avatar",
      "Profile photo must be smaller than 1 MB."
    );
  }

  return file;
}
