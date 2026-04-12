import {
  loginUser
} from "../services/authService.js";
import {
  resetPasswordWithOtp,
  requestRegistrationOtp,
  verifyRegistrationOtp,
  registerUserWithOtp,
  sendPasswordResetOtp,
  sendPhoneVerificationOtp,
  verifyPhoneVerificationOtp
} from "../services/otpService.js";
import { serializeUser } from "../services/userService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const register = asyncHandler(async (req, res) => {
  const result = await registerUserWithOtp(req.body);

  res.status(201).json({
    message: "Registration successful.",
    ...result
  });
});

export const requestRegistration = asyncHandler(async (req, res) => {
  const result = await requestRegistrationOtp(req.body);

  res.status(200).json({
    message: "Signup verification code sent.",
    ...result
  });
});

export const verifyRegistration = asyncHandler(async (req, res) => {
  const result = await verifyRegistrationOtp({
    phoneNumber: req.body.phoneNumber,
    code: req.body.code
  });

  res.status(200).json({
    message: "Signup phone number verified.",
    ...result
  });
});

export const login = asyncHandler(async (req, res) => {
  const result = await loginUser(req.body);

  res.status(200).json({
    message: "Login successful.",
    ...result
  });
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  res.status(200).json({
    user: serializeUser(req.user)
  });
});

export const sendOtp = asyncHandler(async (req, res) => {
  const result = await sendPhoneVerificationOtp({
    userId: req.user._id
  });

  res.status(200).json({
    message: "OTP sent successfully.",
    ...result
  });
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const result = await verifyPhoneVerificationOtp({
    userId: req.user._id,
    code: req.body.code
  });

  res.status(200).json({
    message: "Phone number verified.",
    ...result
  });
});

export const requestPasswordReset = asyncHandler(async (req, res) => {
  const result = await sendPasswordResetOtp({
    phoneNumber: req.body.phoneNumber
  });

  res.status(200).json({
    message: "Password reset OTP sent.",
    ...result
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const result = await resetPasswordWithOtp({
    phoneNumber: req.body.phoneNumber,
    code: req.body.code,
    newPassword: req.body.newPassword,
    confirmNewPassword: req.body.confirmNewPassword
  });

  res.status(200).json({
    message: "Password reset successfully.",
    ...result
  });
});
