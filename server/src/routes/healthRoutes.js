import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "yahneh-api",
    timestamp: new Date().toISOString()
  });
});

export default router;
