import { Router } from "express";
import {
  endLiveStream,
  getLiveStream,
  getLiveStreams,
  getMyActiveLiveStream,
  joinLiveStream,
  kickLiveStreamViewer,
  leaveLiveStream,
  muteLiveStreamViewer,
  startLiveStream,
  strikeLiveStreamViewer,
  updateViewerCount
} from "../controllers/liveStreamController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.post("/", startLiveStream);
router.get("/active", getLiveStreams);
router.get("/mine/active", getMyActiveLiveStream);
router.get("/:streamId", getLiveStream);
router.post("/:streamId/end", endLiveStream);
router.post("/:streamId/join", joinLiveStream);
router.post("/:streamId/leave", leaveLiveStream);
router.post("/:streamId/viewers/:viewerId/strike", strikeLiveStreamViewer);
router.post("/:streamId/viewers/:viewerId/mute", muteLiveStreamViewer);
router.post("/:streamId/viewers/:viewerId/kick", kickLiveStreamViewer);
router.patch("/:streamId/viewer-count", updateViewerCount);

export default router;
