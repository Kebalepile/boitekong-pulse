import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "./appError.js";

export const AVATAR_UPLOAD_LIMIT_BYTES = 1024 * 1024;
export const AVATAR_UPLOAD_PUBLIC_PATH = "/uploads/avatars";

const ALLOWED_AVATAR_MIME_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

const avatarUploadsDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../uploads/avatars"
);

let avatarUploadsDirectoryPromise = null;

function normalizeMimeType(value = "") {
  return String(value || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

function getStoredAvatarFilePath(avatarUrl = "") {
  const trimmedAvatarUrl = String(avatarUrl || "").trim();

  if (!trimmedAvatarUrl) {
    return "";
  }

  let pathname = trimmedAvatarUrl;

  try {
    pathname = new URL(trimmedAvatarUrl).pathname;
  } catch {
    pathname = trimmedAvatarUrl;
  }

  if (!pathname.startsWith(`${AVATAR_UPLOAD_PUBLIC_PATH}/`)) {
    return "";
  }

  const fileName = basename(pathname);
  return fileName ? join(avatarUploadsDirectory, fileName) : "";
}

async function ensureAvatarUploadsDirectory() {
  if (!avatarUploadsDirectoryPromise) {
    avatarUploadsDirectoryPromise = mkdir(avatarUploadsDirectory, {
      recursive: true
    });
  }

  await avatarUploadsDirectoryPromise;
}

export function getAvatarUploadsDirectory() {
  return avatarUploadsDirectory;
}

export async function storeAvatarUpload({
  userId,
  fileBuffer,
  mimeType
}) {
  const safeMimeType = normalizeMimeType(mimeType);

  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
    throw new AppError("Profile photo upload is empty.", {
      statusCode: 400,
      code: "AVATAR_UPLOAD_EMPTY",
      field: "avatar"
    });
  }

  if (fileBuffer.length > AVATAR_UPLOAD_LIMIT_BYTES) {
    throw new AppError("Profile photo is too large after optimization.", {
      statusCode: 400,
      code: "AVATAR_UPLOAD_TOO_LARGE",
      field: "avatar"
    });
  }

  if (!ALLOWED_AVATAR_MIME_TYPES.has(safeMimeType)) {
    throw new AppError("Profile photo must be a PNG, JPG, or WEBP image.", {
      statusCode: 400,
      code: "AVATAR_UPLOAD_TYPE_INVALID",
      field: "avatar"
    });
  }

  await ensureAvatarUploadsDirectory();

  const extension = ALLOWED_AVATAR_MIME_TYPES.get(safeMimeType);
  const fileName = `${String(userId)}-${randomUUID()}.${extension}`;
  const filePath = join(avatarUploadsDirectory, fileName);

  await writeFile(filePath, fileBuffer);

  return `${AVATAR_UPLOAD_PUBLIC_PATH}/${fileName}`;
}

export async function deleteStoredAvatar(avatarUrl = "") {
  const filePath = getStoredAvatarFilePath(avatarUrl);

  if (!filePath) {
    return false;
  }

  await rm(filePath, { force: true });
  return true;
}
