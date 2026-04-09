import {
  loginUser,
  registerUser
} from "../services/authService.js";
import {
  sendPhoneVerificationOtp,
  verifyPhoneVerificationOtp
} from "../services/otpService.js";
import { serializeUser } from "../services/userService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const register = asyncHandler(async (req, res) => {
  const result = await registerUser(req.body);

  res.status(201).json({
    message: "Registration successful.",
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
