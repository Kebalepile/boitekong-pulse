import { Router } from "express";
import {
  getCurrentUser,
  login,
  register,
  sendOtp,
  verifyOtp
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAuth, getCurrentUser);
router.post("/otp/send", requireAuth, sendOtp);
router.post("/otp/verify", requireAuth, verifyOtp);

export default router;
