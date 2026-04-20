import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { AppError } from "../utils/appError.js";
import { signAccessToken } from "../utils/token.js";
import {
  validateExtension,
  validateLoginPassword,
  validatePasswordConfirmation,
  validateRequiredPhoneNumber,
  validateTownship,
  validateUsername
} from "../utils/validators.js";
import { serializeUser } from "./userService.js";

export async function assertRegistrationAvailability({ username, phoneNumber }) {
  const [usernameOwner, phoneOwner] = await Promise.all([
    User.findOne({ usernameLower: username.toLowerCase() }),
    User.findOne({ phoneNumber })
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
}

export function validateRegistrationPayload(payload = {}) {
  const safeUsername = validateUsername(payload.username);
  const safePhoneNumber = validateRequiredPhoneNumber(payload.phoneNumber);
  const safeTownship = validateTownship(payload.township);
  const safeExtension = validateExtension(payload.extension);
  const safePassword = validatePasswordConfirmation(payload.password, payload.confirmPassword);

  return {
    username: safeUsername,
    phoneNumber: safePhoneNumber,
    township: safeTownship,
    extension: safeExtension,
    password: safePassword
  };
}

async function resolveLoginUser(identifier) {
  const safeIdentifier = typeof identifier === "string" ? identifier.trim() : "";

  try {
    const safeUsername = validateUsername(safeIdentifier);
    const userByUsername = await User.findOne({
      usernameLower: safeUsername.toLowerCase()
    }).select("+passwordHash");

    if (userByUsername) {
      return userByUsername;
    }
  } catch {
    // Ignore username validation failures and fall through to phone lookup.
  }

  try {
    const safePhoneNumber = validateRequiredPhoneNumber(safeIdentifier);
    return await User.findOne({ phoneNumber: safePhoneNumber }).select("+passwordHash");
  } catch {
    return null;
  }
}

export async function registerUser(payload = {}, options = {}) {
  const registrationData = validateRegistrationPayload(payload);
  await assertRegistrationAvailability({
    username: registrationData.username,
    phoneNumber: registrationData.phoneNumber
  });

  const passwordHash = await bcrypt.hash(registrationData.password, 12);

  const user = await User.create({
    username: registrationData.username,
    usernameLower: registrationData.username.toLowerCase(),
    phoneNumber: registrationData.phoneNumber,
    passwordHash,
    location: {
      township: registrationData.township,
      extension: registrationData.extension
    },
    phoneVerified: options.phoneVerified === true
  });

  const token = signAccessToken({
    userId: user._id,
    roles: user.roles
  });

  return {
    token,
    user: serializeUser(user, { includePrivateEncryption: true })
  };
}

export async function loginUser(payload = {}) {
  const safeIdentifier = typeof payload.identifier === "string" ? payload.identifier.trim() : "";

  if (!safeIdentifier) {
    throw new AppError("Enter your username or phone number.", {
      statusCode: 400,
      code: "LOGIN_IDENTIFIER_REQUIRED",
      field: "identifier"
    });
  }

  const safePassword = validateLoginPassword(payload.password);

  const user = await resolveLoginUser(safeIdentifier);

  if (!user) {
    throw new AppError("Account not found.", {
      statusCode: 404,
      code: "USER_NOT_FOUND",
      field: "identifier"
    });
  }

  const passwordMatches = await bcrypt.compare(safePassword, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError("Invalid password.", {
      statusCode: 401,
      code: "PASSWORD_INVALID",
      field: "password"
    });
  }

  user.lastSeen = new Date();
  await user.save();

  const token = signAccessToken({
    userId: user._id,
    roles: user.roles
  });

  return {
    token,
    user: serializeUser(user, { includePrivateEncryption: true })
  };
}
