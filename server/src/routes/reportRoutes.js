import { Router } from "express";
import {
  getReportsHandler,
  submitReportHandler
} from "../controllers/reportController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.get("/", getReportsHandler);
router.post("/", submitReportHandler);

export default router;
