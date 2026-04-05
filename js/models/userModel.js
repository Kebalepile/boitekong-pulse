import {
  validateUsername,
  validateTownship,
  validateExtension
} from "../utils/validators.js";

export function createUser({ username, location, passwordHash }) {
  if (!passwordHash || typeof passwordHash !== "string") {
    throw new Error("Password hash is required.");
  }

  return {
    id: crypto.randomUUID(),
    username: validateUsername(username),
    location: {
      township: validateTownship(location.township),
      extension: validateExtension(location.extension)
    },
    avatarDataUrl: "",
    followingUserIds: [],
    passwordHash,
    createdAt: new Date().toISOString()
  };
}
