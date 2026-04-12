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

const router = Router();

router.post("/register/request", requestRegistration);
router.post("/register/verify", verifyRegistration);
router.post("/register", register);
router.post("/login", login);
router.post("/password-reset/request", requestPasswordReset);
router.post("/password-reset/confirm", resetPassword);
router.get("/me", requireAuth, getCurrentUser);
router.post("/otp/send", requireAuth, sendOtp);
router.post("/otp/verify", requireAuth, verifyOtp);

export default router;
