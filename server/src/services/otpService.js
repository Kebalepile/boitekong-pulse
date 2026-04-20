import crypto from "crypto";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { OtpVerification } from "../models/OtpVerification.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/appError.js";
import {
  validatePasswordConfirmation,
  validateRequiredPhoneNumber
} from "../utils/validators.js";
import { sendSms } from "./smsService.js";
import {
  assertRegistrationAvailability,
  registerUser,
  validateRegistrationPayload
} from "./authService.js";

const OTP_PURPOSES = {
  PHONE_VERIFICATION: "phone_verification",
  PASSWORD_RESET: "password_reset",
  REGISTRATION: "registration"
};
const PASSWORD_RESET_OTP_EXPIRES_IN_MINUTES = 5;
const PASSWORD_RESET_DAILY_LIMIT_MS = 24 * 60 * 60 * 1000;

function hashOtpCode({ phoneNumber, code, purpose }) {
  return crypto
    .createHmac("sha256", env.jwtSecret)
    .update(`${purpose}:${phoneNumber}:${code}`)
    .digest("hex");
}

function generateOtpCode() {
  const digits = Math.max(4, env.otpCodeLength);
  const min = 10 ** (digits - 1);
  const max = (10 ** digits) - 1;
  return String(crypto.randomInt(min, max + 1));
}

function getExpiryDate(now = Date.now()) {
  return new Date(now + env.otpExpiresInMinutes * 60 * 1000);
}

function getCooldownDate(now = Date.now()) {
  return new Date(now + env.otpResendCooldownSeconds * 1000);
}

function getPasswordResetExpiryDate(now = Date.now()) {
  return new Date(now + PASSWORD_RESET_OTP_EXPIRES_IN_MINUTES * 60 * 1000);
}

function buildOtpMessage(code) {
  return `Boitekong Pulse verification code: ${code}. It expires in ${env.otpExpiresInMinutes} minute(s).`;
}

function buildPasswordResetOtpMessage(code) {
  return `Boitekong Pulse password reset code: ${code}. It expires in ${PASSWORD_RESET_OTP_EXPIRES_IN_MINUTES} minute(s).`;
}

function buildRegistrationOtpMessage(code) {
  return `Boitekong Pulse signup code: ${code}. Enter it to finish creating your account. It expires in ${env.otpExpiresInMinutes} minute(s).`;
}

async function requireUser(userId) {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError("User not found.", {
      statusCode: 404,
      code: "USER_NOT_FOUND"
    });
  }

  return user;
}

async function findLatestOtp({ userId = null, phoneNumber, purpose }) {
  const query = {
    phoneNumber,
    purpose
  };

  if (userId) {
    query.userId = userId;
  }

  return OtpVerification.findOne(query).sort({ createdAt: -1 });
}

function getPasswordResetAvailableAt(user) {
  const lastResetAtMs = new Date(user?.lastForgotPasswordResetAt || 0).getTime();

  if (!lastResetAtMs || Number.isNaN(lastResetAtMs)) {
    return null;
  }

  return new Date(lastResetAtMs + PASSWORD_RESET_DAILY_LIMIT_MS);
}

function assertPasswordResetAllowed(user) {
  const resetAvailableAt = getPasswordResetAvailableAt(user);

  if (resetAvailableAt && resetAvailableAt.getTime() > Date.now()) {
    throw new AppError("You can only reset your password once every 24 hours.", {
      statusCode: 429,
      code: "PASSWORD_RESET_DAILY_LIMIT",
      details: {
        resetAvailableAt
      }
    });
  }
}

function assertPasswordResetPhoneVerified(user) {
  if (user?.phoneVerified === true) {
    return;
  }

  throw new AppError("Only verified phone numbers can be used to reset a password.", {
    statusCode: 403,
    code: "PHONE_NUMBER_NOT_VERIFIED_FOR_PASSWORD_RESET",
    field: "phoneNumber"
  });
}

export async function sendPhoneVerificationOtp({ userId }) {
  const user = await requireUser(userId);
  const phoneNumber = validateRequiredPhoneNumber(user.phoneNumber);
  const existingOtp = await findLatestOtp({
    userId: user._id,
    phoneNumber,
    purpose: OTP_PURPOSES.PHONE_VERIFICATION
  });
  const now = Date.now();

  if (
    existingOtp &&
    existingOtp.verifiedAt === null &&
    existingOtp.cooldownUntil &&
    existingOtp.cooldownUntil.getTime() > now
  ) {
    throw new AppError("Please wait before requesting another OTP.", {
      statusCode: 429,
      code: "OTP_COOLDOWN_ACTIVE",
      details: {
        cooldownUntil: existingOtp.cooldownUntil
      }
    });
  }

  const code = generateOtpCode();
  const otpRecord = existingOtp || new OtpVerification({
    userId: user._id,
    phoneNumber
  });

  otpRecord.otpCodeHash = hashOtpCode({
    phoneNumber,
    code,
    purpose: OTP_PURPOSES.PHONE_VERIFICATION
  });
  otpRecord.purpose = OTP_PURPOSES.PHONE_VERIFICATION;
  otpRecord.expiresAt = getExpiryDate(now);
  otpRecord.verifiedAt = null;
  otpRecord.attemptCount = 0;
  otpRecord.cooldownUntil = getCooldownDate(now);

  await otpRecord.save();
  await sendSms({
    to: phoneNumber,
    content: buildOtpMessage(code)
  });

  return {
    phoneNumber,
    expiresAt: otpRecord.expiresAt,
    cooldownUntil: otpRecord.cooldownUntil
  };
}

export async function requestRegistrationOtp(payload = {}) {
  const registrationData = validateRegistrationPayload(payload);
  await assertRegistrationAvailability({
    username: registrationData.username,
    phoneNumber: registrationData.phoneNumber
  });

  const existingOtp = await findLatestOtp({
    phoneNumber: registrationData.phoneNumber,
    purpose: OTP_PURPOSES.REGISTRATION
  });
  const now = Date.now();

  if (
    existingOtp &&
    existingOtp.verifiedAt === null &&
    existingOtp.cooldownUntil &&
    existingOtp.cooldownUntil.getTime() > now
  ) {
    throw new AppError("Please wait before requesting another signup code.", {
      statusCode: 429,
      code: "OTP_COOLDOWN_ACTIVE",
      field: "phoneNumber",
      details: {
        cooldownUntil: existingOtp.cooldownUntil,
        expiresAt: existingOtp.expiresAt
      }
    });
  }

  const code = generateOtpCode();
  const otpRecord = existingOtp || new OtpVerification({
    phoneNumber: registrationData.phoneNumber,
    purpose: OTP_PURPOSES.REGISTRATION
  });

  otpRecord.otpCodeHash = hashOtpCode({
    phoneNumber: registrationData.phoneNumber,
    code,
    purpose: OTP_PURPOSES.REGISTRATION
  });
  otpRecord.purpose = OTP_PURPOSES.REGISTRATION;
  otpRecord.expiresAt = getExpiryDate(now);
  otpRecord.verifiedAt = null;
  otpRecord.attemptCount = 0;
  otpRecord.cooldownUntil = getCooldownDate(now);

  await otpRecord.save();
  await sendSms({
    to: registrationData.phoneNumber,
    content: buildRegistrationOtpMessage(code)
  });

  return {
    phoneNumber: registrationData.phoneNumber,
    expiresAt: otpRecord.expiresAt,
    cooldownUntil: otpRecord.cooldownUntil
  };
}

export async function verifyRegistrationOtp({ phoneNumber, code }) {
  const safePhoneNumber = validateRequiredPhoneNumber(phoneNumber);
  const safeCode = typeof code === "string" ? code.trim() : "";

  if (!safeCode) {
    throw new AppError("SMS code is required.", {
      statusCode: 400,
      code: "OTP_CODE_REQUIRED",
      field: "code"
    });
  }

  const otpRecord = await findLatestOtp({
    phoneNumber: safePhoneNumber,
    purpose: OTP_PURPOSES.REGISTRATION
  });

  if (!otpRecord) {
    throw new AppError("No active signup code was found for that phone number.", {
      statusCode: 404,
      code: "REGISTRATION_OTP_NOT_FOUND",
      field: "code"
    });
  }

  if (otpRecord.verifiedAt) {
    return {
      phoneNumber: safePhoneNumber,
      verified: true,
      verifiedAt: otpRecord.verifiedAt
    };
  }

  if (otpRecord.expiresAt.getTime() < Date.now()) {
    throw new AppError("The signup code has expired. Request a new one.", {
      statusCode: 400,
      code: "OTP_EXPIRED",
      field: "code"
    });
  }

  const expectedHash = hashOtpCode({
    phoneNumber: safePhoneNumber,
    code: safeCode,
    purpose: OTP_PURPOSES.REGISTRATION
  });

  if (otpRecord.otpCodeHash !== expectedHash) {
    otpRecord.attemptCount += 1;

    if (otpRecord.attemptCount >= env.otpMaxAttempts) {
      otpRecord.expiresAt = new Date();
    }

    await otpRecord.save();

    throw new AppError("OTP is invalid.", {
      statusCode: 400,
      code: "OTP_INVALID",
      field: "code",
      details: {
        attemptsRemaining: Math.max(0, env.otpMaxAttempts - otpRecord.attemptCount)
      }
    });
  }

  otpRecord.verifiedAt = new Date();
  await otpRecord.save();

  return {
    phoneNumber: safePhoneNumber,
    verified: true,
    verifiedAt: otpRecord.verifiedAt
  };
}

export async function verifyPhoneVerificationOtp({ userId, code }) {
  const user = await requireUser(userId);
  const phoneNumber = validateRequiredPhoneNumber(user.phoneNumber);
  const safeCode = typeof code === "string" ? code.trim() : "";

  if (!safeCode) {
    throw new AppError("OTP code is required.", {
      statusCode: 400,
      code: "OTP_CODE_REQUIRED",
      field: "code"
    });
  }

  const otpRecord = await findLatestOtp({
    userId: user._id,
    phoneNumber,
    purpose: OTP_PURPOSES.PHONE_VERIFICATION
  });

  if (!otpRecord || otpRecord.verifiedAt) {
    throw new AppError("No active OTP was found.", {
      statusCode: 404,
      code: "OTP_NOT_FOUND"
    });
  }

  if (otpRecord.expiresAt.getTime() < Date.now()) {
    throw new AppError("OTP has expired. Request a new code.", {
      statusCode: 400,
      code: "OTP_EXPIRED"
    });
  }

  const expectedHash = hashOtpCode({
    phoneNumber,
    code: safeCode,
    purpose: OTP_PURPOSES.PHONE_VERIFICATION
  });

  if (otpRecord.otpCodeHash !== expectedHash) {
    otpRecord.attemptCount += 1;

    if (otpRecord.attemptCount >= env.otpMaxAttempts) {
      otpRecord.expiresAt = new Date();
    }

    await otpRecord.save();

    throw new AppError("OTP is invalid.", {
      statusCode: 400,
      code: "OTP_INVALID",
      field: "code",
      details: {
        attemptsRemaining: Math.max(0, env.otpMaxAttempts - otpRecord.attemptCount)
      }
    });
  }

  otpRecord.verifiedAt = new Date();
  await otpRecord.save();

  user.phoneVerified = true;
  await user.save();

  return {
    userId: String(user._id),
    phoneVerified: true,
    verifiedAt: otpRecord.verifiedAt
  };
}

export async function registerUserWithOtp(payload = {}) {
  const registrationData = validateRegistrationPayload(payload);
  await assertRegistrationAvailability({
    username: registrationData.username,
    phoneNumber: registrationData.phoneNumber
  });

  const otpRecord = await findLatestOtp({
    phoneNumber: registrationData.phoneNumber,
    purpose: OTP_PURPOSES.REGISTRATION
  });

  if (!otpRecord?.verifiedAt) {
    throw new AppError("Verify your phone number before creating the account.", {
      statusCode: 403,
      code: "REGISTRATION_PHONE_NOT_VERIFIED",
      field: "code"
    });
  }

  const registrationResult = await registerUser(payload, {
    phoneVerified: true
  });

  otpRecord.userId = registrationResult?.user?.id || otpRecord.userId || null;
  await otpRecord.save();

  return registrationResult;
}

export async function sendPasswordResetOtp({ phoneNumber }) {
  const safePhoneNumber = validateRequiredPhoneNumber(phoneNumber);
  const user = await User.findOne({ phoneNumber: safePhoneNumber });

  if (!user) {
    throw new AppError("No account was found for that phone number.", {
      statusCode: 404,
      code: "PHONE_NUMBER_NOT_FOUND",
      field: "phoneNumber"
    });
  }

  assertPasswordResetPhoneVerified(user);
  assertPasswordResetAllowed(user);

  const existingOtp = await findLatestOtp({
    userId: user._id,
    phoneNumber: safePhoneNumber,
    purpose: OTP_PURPOSES.PASSWORD_RESET
  });
  const now = Date.now();

  if (
    existingOtp &&
    existingOtp.verifiedAt === null &&
    existingOtp.cooldownUntil &&
    existingOtp.cooldownUntil.getTime() > now
  ) {
    throw new AppError("Please wait before requesting another OTP.", {
      statusCode: 429,
      code: "OTP_COOLDOWN_ACTIVE",
      field: "phoneNumber",
      details: {
        cooldownUntil: existingOtp.cooldownUntil
      }
    });
  }

  const code = generateOtpCode();
  const otpRecord = existingOtp || new OtpVerification({
    userId: user._id,
    phoneNumber: safePhoneNumber,
    purpose: OTP_PURPOSES.PASSWORD_RESET
  });

  otpRecord.otpCodeHash = hashOtpCode({
    phoneNumber: safePhoneNumber,
    code,
    purpose: OTP_PURPOSES.PASSWORD_RESET
  });
  otpRecord.purpose = OTP_PURPOSES.PASSWORD_RESET;
  otpRecord.expiresAt = getPasswordResetExpiryDate(now);
  otpRecord.verifiedAt = null;
  otpRecord.attemptCount = 0;
  otpRecord.cooldownUntil = getCooldownDate(now);

  await otpRecord.save();
  await sendSms({
    to: safePhoneNumber,
    content: buildPasswordResetOtpMessage(code)
  });

  return {
    phoneNumber: safePhoneNumber,
    expiresAt: otpRecord.expiresAt,
    cooldownUntil: otpRecord.cooldownUntil
  };
}

export async function resetPasswordWithOtp({
  phoneNumber,
  code,
  newPassword,
  confirmNewPassword
}) {
  const safePhoneNumber = validateRequiredPhoneNumber(phoneNumber);
  const safeCode = typeof code === "string" ? code.trim() : "";

  if (!safeCode) {
    throw new AppError("OTP code is required.", {
      statusCode: 400,
      code: "OTP_CODE_REQUIRED",
      field: "code"
    });
  }

  const user = await User.findOne({ phoneNumber: safePhoneNumber }).select("+passwordHash");

  if (!user) {
    throw new AppError("No account was found for that phone number.", {
      statusCode: 404,
      code: "PHONE_NUMBER_NOT_FOUND",
      field: "phoneNumber"
    });
  }

  assertPasswordResetPhoneVerified(user);
  assertPasswordResetAllowed(user);

  const otpRecord = await findLatestOtp({
    userId: user._id,
    phoneNumber: safePhoneNumber,
    purpose: OTP_PURPOSES.PASSWORD_RESET
  });

  if (!otpRecord || otpRecord.verifiedAt) {
    throw new AppError("No active password reset code was found.", {
      statusCode: 404,
      code: "PASSWORD_RESET_OTP_NOT_FOUND"
    });
  }

  if (otpRecord.expiresAt.getTime() < Date.now()) {
    throw new AppError("The reset code has expired. Request a new one.", {
      statusCode: 400,
      code: "OTP_EXPIRED",
      field: "code"
    });
  }

  const expectedHash = hashOtpCode({
    phoneNumber: safePhoneNumber,
    code: safeCode,
    purpose: OTP_PURPOSES.PASSWORD_RESET
  });

  if (otpRecord.otpCodeHash !== expectedHash) {
    otpRecord.attemptCount += 1;

    if (otpRecord.attemptCount >= env.otpMaxAttempts) {
      otpRecord.expiresAt = new Date();
    }

    await otpRecord.save();

    throw new AppError("OTP is invalid.", {
      statusCode: 400,
      code: "OTP_INVALID",
      field: "code",
      details: {
        attemptsRemaining: Math.max(0, env.otpMaxAttempts - otpRecord.attemptCount)
      }
    });
  }

  const safePassword = validatePasswordConfirmation(newPassword, confirmNewPassword);
  const passwordMatchesCurrent = await bcrypt.compare(safePassword, user.passwordHash);

  if (passwordMatchesCurrent) {
    throw new AppError("Choose a new password that is different from your current one.", {
      statusCode: 400,
      code: "PASSWORD_UNCHANGED",
      field: "password"
    });
  }

  user.passwordHash = await bcrypt.hash(safePassword, 12);
  user.directMessageEncryption = null;
  user.lastForgotPasswordResetAt = new Date();
  await user.save();

  otpRecord.verifiedAt = new Date();
  await otpRecord.save();

  return {
    phoneNumber: safePhoneNumber,
    resetAt: user.lastForgotPasswordResetAt
  };
}
