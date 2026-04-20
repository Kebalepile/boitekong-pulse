import { Router } from "express";
import {
  getCurrentUser,
  login,
  requestRegistration,
  verifyRegistration,
  requestPasswordReset,
  register,
  resetPassword,
  sendOtp,
  verifyOtp
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimitMiddleware, rateLimitKeys } from "../middleware/rateLimit.js";

const router = Router();
const MINUTE_IN_MS = 60 * 1000;

const loginIpLimiter = createRateLimitMiddleware({
  windowMs: 15 * MINUTE_IN_MS,
  max: 15,
  key: (req) => rateLimitKeys.ip(req),
  code: "LOGIN_RATE_LIMITED",
  message: "Too many login attempts right now. Please wait a few minutes and try again."
});

const loginIdentifierLimiter = createRateLimitMiddleware({
  windowMs: 15 * MINUTE_IN_MS,
  max: 8,
  key: (req) => rateLimitKeys.bodyField(req, "identifier"),
  code: "LOGIN_RATE_LIMITED",
  message: "Too many login attempts for that account. Please wait a few minutes and try again."
});

const registrationRequestIpLimiter = createRateLimitMiddleware({
  windowMs: 30 * MINUTE_IN_MS,
  max: 8,
  key: (req) => rateLimitKeys.ip(req),
  code: "REGISTRATION_REQUEST_RATE_LIMITED",
  message: "Too many signup verification requests right now. Please try again later."
});

const registrationRequestPhoneLimiter = createRateLimitMiddleware({
  windowMs: 30 * MINUTE_IN_MS,
  max: 3,
  key: (req) => rateLimitKeys.bodyField(req, "phoneNumber"),
  code: "REGISTRATION_REQUEST_RATE_LIMITED",
  message: "Too many signup verification requests for that phone number. Please try again later."
});

const registrationVerifyIpLimiter = createRateLimitMiddleware({
  windowMs: 30 * MINUTE_IN_MS,
  max: 15,
  key: (req) => rateLimitKeys.ip(req),
  code: "REGISTRATION_VERIFY_RATE_LIMITED",
  message: "Too many signup verification attempts right now. Please wait a little and try again."
});

const registrationVerifyPhoneLimiter = createRateLimitMiddleware({
  windowMs: 30 * MINUTE_IN_MS,
  max: 8,
  key: (req) => rateLimitKeys.bodyField(req, "phoneNumber"),
  code: "REGISTRATION_VERIFY_RATE_LIMITED",
  message: "Too many signup verification attempts for that phone number. Please wait and try again."
});

const registrationCompleteIpLimiter = createRateLimitMiddleware({
  windowMs: 60 * MINUTE_IN_MS,
  max: 6,
  key: (req) => rateLimitKeys.ip(req),
  code: "REGISTRATION_COMPLETE_RATE_LIMITED",
  message: "Too many registration attempts right now. Please try again later."
});

const registrationCompletePhoneLimiter = createRateLimitMiddleware({
  windowMs: 60 * MINUTE_IN_MS,
  max: 3,
  key: (req) => rateLimitKeys.bodyField(req, "phoneNumber"),
  code: "REGISTRATION_COMPLETE_RATE_LIMITED",
  message: "Too many registration attempts for that phone number. Please try again later."
});

const passwordResetRequestIpLimiter = createRateLimitMiddleware({
  windowMs: 30 * MINUTE_IN_MS,
  max: 6,
  key: (req) => rateLimitKeys.ip(req),
  code: "PASSWORD_RESET_REQUEST_RATE_LIMITED",
  message: "Too many password reset requests right now. Please try again later."
});

const passwordResetRequestPhoneLimiter = createRateLimitMiddleware({
  windowMs: 30 * MINUTE_IN_MS,
  max: 3,
  key: (req) => rateLimitKeys.bodyField(req, "phoneNumber"),
  code: "PASSWORD_RESET_REQUEST_RATE_LIMITED",
  message: "Too many password reset requests for that phone number. Please try again later."
});

const passwordResetConfirmIpLimiter = createRateLimitMiddleware({
  windowMs: 30 * MINUTE_IN_MS,
  max: 10,
  key: (req) => rateLimitKeys.ip(req),
  code: "PASSWORD_RESET_CONFIRM_RATE_LIMITED",
  message: "Too many password reset attempts right now. Please wait and try again."
});

const passwordResetConfirmPhoneLimiter = createRateLimitMiddleware({
  windowMs: 30 * MINUTE_IN_MS,
  max: 5,
  key: (req) => rateLimitKeys.bodyField(req, "phoneNumber"),
  code: "PASSWORD_RESET_CONFIRM_RATE_LIMITED",
  message: "Too many password reset attempts for that phone number. Please wait and try again."
});

const otpSendIpLimiter = createRateLimitMiddleware({
  windowMs: 15 * MINUTE_IN_MS,
  max: 12,
  key: (req) => rateLimitKeys.ip(req),
  code: "OTP_SEND_RATE_LIMITED",
  message: "Too many OTP send attempts right now. Please wait and try again."
});

const otpSendUserLimiter = createRateLimitMiddleware({
  windowMs: 15 * MINUTE_IN_MS,
  max: 6,
  key: (req) => rateLimitKeys.authenticatedUser(req),
  code: "OTP_SEND_RATE_LIMITED",
  message: "Too many OTP send attempts on this account. Please wait and try again."
});

const otpVerifyIpLimiter = createRateLimitMiddleware({
  windowMs: 15 * MINUTE_IN_MS,
  max: 20,
  key: (req) => rateLimitKeys.ip(req),
  code: "OTP_VERIFY_RATE_LIMITED",
  message: "Too many OTP verification attempts right now. Please wait and try again."
});

const otpVerifyUserLimiter = createRateLimitMiddleware({
  windowMs: 15 * MINUTE_IN_MS,
  max: 12,
  key: (req) => rateLimitKeys.authenticatedUser(req),
  code: "OTP_VERIFY_RATE_LIMITED",
  message: "Too many OTP verification attempts on this account. Please wait and try again."
});

router.post(
  "/register/request",
  registrationRequestIpLimiter,
  registrationRequestPhoneLimiter,
  requestRegistration
);
router.post(
  "/register/verify",
  registrationVerifyIpLimiter,
  registrationVerifyPhoneLimiter,
  verifyRegistration
);
router.post(
  "/register",
  registrationCompleteIpLimiter,
  registrationCompletePhoneLimiter,
  register
);
router.post("/login", loginIpLimiter, loginIdentifierLimiter, login);
router.post(
  "/password-reset/request",
  passwordResetRequestIpLimiter,
  passwordResetRequestPhoneLimiter,
  requestPasswordReset
);
router.post(
  "/password-reset/confirm",
  passwordResetConfirmIpLimiter,
  passwordResetConfirmPhoneLimiter,
  resetPassword
);
router.get("/me", requireAuth, getCurrentUser);
router.post("/otp/send", otpSendIpLimiter, requireAuth, otpSendUserLimiter, sendOtp);
router.post("/otp/verify", otpVerifyIpLimiter, requireAuth, otpVerifyUserLimiter, verifyOtp);

export default router;
