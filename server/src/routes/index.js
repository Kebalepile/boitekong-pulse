import { Router } from "express";
import authRoutes from "./authRoutes.js";
import conversationRoutes from "./conversationRoutes.js";
import healthRoutes from "./healthRoutes.js";
import livestreamRoutes from "./livestreamRoutes.js";
import notificationRoutes from "./notificationRoutes.js";
import postRoutes from "./postRoutes.js";
import reportRoutes from "./reportRoutes.js";
import userRoutes from "./userRoutes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/conversations", conversationRoutes);
router.use("/livestreams", livestreamRoutes);
router.use("/notifications", notificationRoutes);
router.use("/posts", postRoutes);
router.use("/reports", reportRoutes);
router.use("/users", userRoutes);

export default router;
