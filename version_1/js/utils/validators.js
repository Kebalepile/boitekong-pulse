const USERNAME_REGEX = /^(?=.{3,20}$)[A-Za-z0-9_]+$/;
const TOWNSHIP_REGEX = /^(?=.{2,40}$)[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;
const EXTENSION_REGEX = /^(?=.{1,12}$)(?:Ext(?:ension)?\.?\s?\d{1,3}|\d{1,3})$/i;
const POST_CONTENT_REGEX = /^(?=.{1,500}$)[\p{L}\p{N}\p{P}\p{Zs}\n\r\t]+$/u;

const COMMON_WEAK_PASSWORDS = new Set([
  "password",
  "password123",
  "123456",
  "12345678",
  "123456789",
  "qwerty",
  "qwerty123",
  "admin",
  "admin123",
  "welcome",
  "letmein",
  "abc123",
  "iloveyou",
  "000000",
  "111111"
]);

function collapseWhitespace(value) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeUsername(value) {
  return collapseWhitespace(value);
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

  if (!USERNAME_REGEX.test(normalized)) {
    throw new Error(
      "Username must be 3-20 characters and use only letters, numbers, or underscores."
    );
  }

  return normalized;
}

export function validateTownship(value) {
  const normalized = normalizeTownship(value);

  if (!TOWNSHIP_REGEX.test(normalized)) {
    throw new Error(
      "Township must be 2-40 letters and may include spaces, apostrophes, or hyphens."
    );
  }

  return normalized;
}

export function validateExtension(value) {
  const normalized = normalizeExtension(value);

  if (!EXTENSION_REGEX.test(normalized)) {
    throw new Error('Extension must look like "Ext 2" or "2".');
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
    throw new Error("Password must be between 12 and 64 characters.");
  }

  if (!hasUppercase(normalized)) {
    throw new Error("Password must include at least one uppercase letter.");
  }

  if (!hasLowercase(normalized)) {
    throw new Error("Password must include at least one lowercase letter.");
  }

  if (!hasNumber(normalized)) {
    throw new Error("Password must include at least one number.");
  }

  if (!hasSpecialCharacter(normalized)) {
    throw new Error("Password must include at least one special character.");
  }

  if (COMMON_WEAK_PASSWORDS.has(normalized.toLowerCase())) {
    throw new Error("Password is too common. Choose a stronger password.");
  }

  if (hasLongRepeat(normalized)) {
    throw new Error("Password has too many repeated characters.");
  }

  if (hasSequentialPattern(normalized)) {
    throw new Error("Password is too predictable. Avoid obvious sequences.");
  }

  return normalized;
}

export function validatePostContent(value) {
  const normalized = normalizePostContent(value);

  if (!POST_CONTENT_REGEX.test(normalized)) {
    throw new Error("Post content is required and must be 1-500 valid characters.");
  }

  return normalized;
}

export function validateImageUrl(value) {
  const trimmed = value.trim();

  if (!trimmed) return "";

  try {
    const url = new URL(trimmed, window.location.origin);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Only http and https image URLs are allowed.");
    }

    return url.toString();
  } catch {
    throw new Error("Image URL is invalid.");
  }
}