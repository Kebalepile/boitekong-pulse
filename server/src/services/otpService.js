import crypto from "crypto";
import { env } from "../config/env.js";
import { OtpVerification } from "../models/OtpVerification.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/appError.js";
import { validateRequiredPhoneNumber } from "../utils/validators.js";
import { sendSms } from "./smsService.js";

function hashOtpCode({ phoneNumber, code }) {
  return crypto
    .createHmac("sha256", env.jwtSecret)
    .update(`${phoneNumber}:${code}`)
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

function buildOtpMessage(code) {
  return `Boitekong Pulse verification code: ${code}. It expires in ${env.otpExpiresInMinutes} minute(s).`;
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

async function findLatestOtp(userId, phoneNumber) {
  return OtpVerification.findOne({
    userId,
    phoneNumber
  }).sort({ createdAt: -1 });
}

export async function sendPhoneVerificationOtp({ userId }) {
  const user = await requireUser(userId);
  const phoneNumber = validateRequiredPhoneNumber(user.phoneNumber);
  const existingOtp = await findLatestOtp(user._id, phoneNumber);
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
    code
  });
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

  const otpRecord = await findLatestOtp(user._id, phoneNumber);

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
    code: safeCode
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
