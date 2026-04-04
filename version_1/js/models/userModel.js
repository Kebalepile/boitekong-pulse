import {
  validateUsername,
  validateTownship,
  validateExtension,
  validatePassword
} from "../utils/validators.js";

export function createUser({ username, location, password }) {
  return {
    id: crypto.randomUUID(),
    username: validateUsername(username),
    location: {
      township: validateTownship(location.township),
      extension: validateExtension(location.extension)
    },
    password: validatePassword(password),
    createdAt: new Date().toISOString()
  };
}