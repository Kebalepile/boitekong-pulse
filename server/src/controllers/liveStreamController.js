import { randomBytes, createHash } from "node:crypto";
import { LiveStream } from "../models/LiveStream.js";
import { User } from "../models/User.js";
import { publishToAll, stopStreamRelay } from "../services/realtimeService.js";
import { AppError } from "../utils/appError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validateImageUrl } from "../utils/validators.js";

const LIVE_STREAM_MAX_DURATION_MS = 12 * 60 * 60 * 1000;

function normalizeText(value, maxLength) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.slice(0, maxLength);
}

function hashToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function serializeBroadcaster(user) {
  if (!user) {
    return null;
  }

  return {
    id: String(user._id),
    username: user.username,
    avatar: user.avatarUrl || user.avatar || ""
  };
}

function getStreamBroadcasterId(stream) {
  return String(stream?.broadcasterId?._id || stream?.broadcasterId || "");
}

function serializeStream(stream, broadcasterOverride = null) {
  const broadcaster = broadcasterOverride || stream.broadcasterId;
  const broadcasterData =
    broadcaster && typeof broadcaster === "object" && broadcaster.username
      ? serializeBroadcaster(broadcaster)
      : { id: getStreamBroadcasterId(stream), username: "", avatar: "" };

  return {
    id: String(stream._id),
    _id: String(stream._id),
    broadcasterId: broadcasterData,
    title: stream.title,
    description: stream.description || "",
    coverImageUrl: stream.coverImageUrl || "",
    coverImage: stream.coverImageUrl || "",
    status: stream.status,
    startTime: stream.startTime,
    startedAt: stream.startTime,
    endTime: stream.endTime,
    viewerCount: stream.viewerCount,
    peakViewerCount: stream.peakViewerCount
  };
}

async function serializeStreamsWithBroadcasters(streams) {
  const broadcasterIds = Array.from(
    new Set(streams.map(getStreamBroadcasterId).filter(Boolean))
  );
  const broadcasters = broadcasterIds.length > 0
    ? await User.find({ _id: { $in: broadcasterIds } }).select("username avatarUrl")
    : [];
  const broadcasterMap = new Map(
    broadcasters.map((broadcaster) => [String(broadcaster._id), broadcaster])
  );

  return streams.map((stream) =>
    serializeStream(stream, broadcasterMap.get(getStreamBroadcasterId(stream)))
  );
}

function findViewerModeration(stream, viewerId) {
  return stream.viewerModeration.find((entry) => String(entry.viewerId) === String(viewerId));
}

function assertStreamBroadcaster(stream, userId) {
  if (String(stream.broadcasterId) !== String(userId)) {
    throw new AppError("You can only manage your own live stream.", {
      statusCode: 403,
      code: "LIVESTREAM_FORBIDDEN"
    });
  }
}

function isStaleActiveStream(stream, now = Date.now()) {
  const startedAt = new Date(stream?.startTime || stream?.createdAt || 0).getTime();

  return Boolean(
    stream?.status === "active" &&
      Number.isFinite(startedAt) &&
      startedAt > 0 &&
      now - startedAt > LIVE_STREAM_MAX_DURATION_MS
  );
}

async function endStaleLiveStream(stream, { reason = "stale_timeout" } = {}) {
  if (!isStaleActiveStream(stream)) {
    return false;
  }

  stream.status = "ended";
  stream.endTime = stream.endTime || new Date();
  stream.viewerCount = 0;
  stream.signalingTokens = [];
  await stream.save();
  stopStreamRelay(String(stream._id), reason);

  publishToAll({
    type: "stream:ended",
    streamId: String(stream._id),
    broadcasterId: getStreamBroadcasterId(stream),
    reason,
    timestamp: Date.now()
  });

  return true;
}

async function endStaleLiveStreams(streams = []) {
  await Promise.all(streams.map((stream) => endStaleLiveStream(stream)));
}

export const startLiveStream = asyncHandler(async (req, res) => {
  const title = normalizeText(req.body.title, 40);
  const description = normalizeText(req.body.description, 100);
  const coverImageUrl = validateImageUrl(
    req.body.coverImage ?? req.body.coverImageUrl,
    "coverImage"
  );

  if (!title) {
    throw new AppError("Stream title is required.", {
      statusCode: 400,
      code: "LIVESTREAM_TITLE_REQUIRED",
      field: "title"
    });
  }

  const existingStream = await LiveStream.findOne({
    broadcasterId: req.user._id,
    status: "active"
  });

  if (existingStream && !(await endStaleLiveStream(existingStream))) {
    throw new AppError("You already have a live stream. Open your current stream instead.", {
      statusCode: 409,
      code: "LIVESTREAM_ALREADY_ACTIVE"
    });
  }

  const liveStream = await LiveStream.create({
    broadcasterId: req.user._id,
    title,
    description,
    coverImageUrl
  });
  const stream = serializeStream(liveStream, req.user);

  publishToAll({
    type: "stream:started",
    streamId: stream.id,
    broadcaster: serializeBroadcaster(req.user),
    title,
    description,
    coverImageUrl,
    coverImage: coverImageUrl,
    viewerCount: 0,
    timestamp: Date.now()
  });

  res.status(201).json({ stream });
});

export const endLiveStream = asyncHandler(async (req, res) => {
  const stream = await LiveStream.findById(req.params.streamId);

  if (!stream) {
    throw new AppError("Stream not found.", {
      statusCode: 404,
      code: "LIVESTREAM_NOT_FOUND"
    });
  }

  if (String(stream.broadcasterId) !== String(req.user._id)) {
    throw new AppError("You can only end your own live stream.", {
      statusCode: 403,
      code: "LIVESTREAM_FORBIDDEN"
    });
  }

  if (stream.status !== "ended") {
    stream.status = "ended";
    stream.endTime = new Date();
    stream.viewerCount = 0;
    stream.signalingTokens = [];
    stream.coverImageUrl = "";
    await stream.save();
  }
  stopStreamRelay(String(stream._id), "ended");

  publishToAll({
    type: "stream:ended",
    streamId: String(stream._id),
    broadcasterId: String(req.user._id),
    timestamp: Date.now()
  });

  res.status(200).json({
    message: "Stream ended.",
    durationMs: stream.endTime ? stream.endTime.getTime() - stream.startTime.getTime() : 0,
    peakViewerCount: stream.peakViewerCount
  });
});

export const getLiveStreams = asyncHandler(async (_req, res) => {
  const streams = await LiveStream.find({ status: "active" })
    .sort({ createdAt: -1 });
  await endStaleLiveStreams(streams);
  const activeStreams = streams.filter((stream) => stream.status === "active");

  res.status(200).json({ streams: await serializeStreamsWithBroadcasters(activeStreams) });
});

export const getMyActiveLiveStream = asyncHandler(async (req, res) => {
  const stream = await LiveStream.findOne({
    broadcasterId: req.user._id,
    status: "active"
  });
  const staleEnded = stream ? await endStaleLiveStream(stream) : false;

  res.status(200).json({
    stream: stream && !staleEnded ? serializeStream(stream, req.user) : null
  });
});

export const getLiveStream = asyncHandler(async (req, res) => {
  const stream = await LiveStream.findById(req.params.streamId);

  if (!stream) {
    throw new AppError("Stream not found.", {
      statusCode: 404,
      code: "LIVESTREAM_NOT_FOUND"
    });
  }

  await endStaleLiveStream(stream);

  const broadcaster = await User.findById(getStreamBroadcasterId(stream)).select(
    "username avatarUrl"
  );

  res.status(200).json({ stream: serializeStream(stream, broadcaster) });
});

export const joinLiveStream = asyncHandler(async (req, res) => {
  const stream = await LiveStream.findById(req.params.streamId);

  if (stream) {
    await endStaleLiveStream(stream);
  }

  if (!stream || stream.status !== "active") {
    throw new AppError("Stream is not live.", {
      statusCode: 404,
      code: "LIVESTREAM_NOT_ACTIVE"
    });
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const viewerId = req.user._id;
  const moderation = findViewerModeration(stream, viewerId);

  if (String(stream.broadcasterId) === String(viewerId)) {
    throw new AppError("You cannot watch your own live stream. Open the current stream controls instead.", {
      statusCode: 403,
      code: "LIVESTREAM_OWN_STREAM"
    });
  }

  if (moderation?.kickedAt) {
    throw new AppError("You were removed from this live stream.", {
      statusCode: 403,
      code: "LIVESTREAM_VIEWER_KICKED"
    });
  }

  stream.signalingTokens = stream.signalingTokens.filter(
    (entry) => String(entry.viewerId) !== String(viewerId)
  );
  stream.signalingTokens.push({
    viewerId,
    tokenHash
  });
  stream.viewerCount = stream.signalingTokens.length;
  stream.peakViewerCount = Math.max(stream.peakViewerCount, stream.viewerCount);
  await stream.save();

  const broadcaster = await User.findById(stream.broadcasterId).select("username avatarUrl");

  publishToAll({
    type: "stream:viewer-joined",
    streamId: String(stream._id),
    viewerId: String(viewerId),
    viewer: serializeBroadcaster(req.user),
    viewerCount: stream.viewerCount,
    timestamp: Date.now()
  });

  res.status(200).json({
    streamId: String(stream._id),
    signalingToken: token,
    viewerCount: stream.viewerCount,
    viewer: serializeBroadcaster(req.user),
    broadcaster: broadcaster ? serializeBroadcaster(broadcaster) : null
  });
});

export const leaveLiveStream = asyncHandler(async (req, res) => {
  const stream = await LiveStream.findById(req.params.streamId);

  if (!stream) {
    throw new AppError("Stream not found.", {
      statusCode: 404,
      code: "LIVESTREAM_NOT_FOUND"
    });
  }

  stream.signalingTokens = stream.signalingTokens.filter(
    (entry) => String(entry.viewerId) !== String(req.user._id)
  );
  stream.viewerCount = stream.signalingTokens.length;
  await stream.save();

  publishToAll({
    type: "stream:viewer-left",
    streamId: String(stream._id),
    viewerId: String(req.user._id),
    viewer: serializeBroadcaster(req.user),
    viewerCount: stream.viewerCount,
    timestamp: Date.now()
  });

  res.status(200).json({
    message: "Left stream.",
    viewerCount: stream.viewerCount
  });
});

export const updateViewerCount = asyncHandler(async (req, res) => {
  const stream = await LiveStream.findById(req.params.streamId);

  if (!stream) {
    throw new AppError("Stream not found.", {
      statusCode: 404,
      code: "LIVESTREAM_NOT_FOUND"
    });
  }

  if (String(stream.broadcasterId) !== String(req.user._id)) {
    throw new AppError("You can only update your own stream.", {
      statusCode: 403,
      code: "LIVESTREAM_FORBIDDEN"
    });
  }

  const nextCount = Math.max(0, Number.parseInt(req.body.count, 10) || 0);
  stream.viewerCount = nextCount;
  stream.peakViewerCount = Math.max(stream.peakViewerCount, nextCount);
  await stream.save();

  publishToAll({
    type: "stream:viewer-count",
    streamId: String(stream._id),
    viewerCount: stream.viewerCount,
    timestamp: Date.now()
  });

  res.status(200).json({ viewerCount: stream.viewerCount });
});

export const strikeLiveStreamViewer = asyncHandler(async (req, res) => {
  const stream = await LiveStream.findById(req.params.streamId);

  if (!stream || stream.status !== "active") {
    throw new AppError("Stream is not live.", {
      statusCode: 404,
      code: "LIVESTREAM_NOT_ACTIVE"
    });
  }

  assertStreamBroadcaster(stream, req.user._id);

  const viewerId = req.params.viewerId;
  const viewer = await User.findById(viewerId).select("username avatarUrl");

  if (!viewer) {
    throw new AppError("Viewer not found.", {
      statusCode: 404,
      code: "LIVESTREAM_VIEWER_NOT_FOUND"
    });
  }

  let moderation = findViewerModeration(stream, viewerId);

  if (!moderation) {
    stream.viewerModeration.push({
      viewerId,
      strikes: 0
    });
    moderation = stream.viewerModeration[stream.viewerModeration.length - 1];
  }

  moderation.strikes = Math.min((moderation.strikes || 0) + 1, 3);
  moderation.updatedAt = new Date();

  if (moderation.strikes >= 3) {
    moderation.kickedAt = new Date();
    stream.signalingTokens = stream.signalingTokens.filter(
      (entry) => String(entry.viewerId) !== String(viewerId)
    );
    stream.viewerCount = stream.signalingTokens.length;
  }

  await stream.save();

  const payload = {
    type: moderation.kickedAt ? "stream:kicked" : "stream:viewer-strike",
    streamId: String(stream._id),
    targetUserId: String(viewerId),
    viewerId: String(viewerId),
    viewer: serializeBroadcaster(viewer),
    strikes: moderation.strikes,
    viewerCount: stream.viewerCount,
    timestamp: Date.now()
  };

  publishToAll(payload);

  res.status(200).json({
    viewer: serializeBroadcaster(viewer),
    strikes: moderation.strikes,
    kicked: Boolean(moderation.kickedAt),
    viewerCount: stream.viewerCount
  });
});

async function moderateLiveStreamViewer(req, { action }) {
  const stream = await LiveStream.findById(req.params.streamId);

  if (!stream || stream.status !== "active") {
    throw new AppError("Stream is not live.", {
      statusCode: 404,
      code: "LIVESTREAM_NOT_ACTIVE"
    });
  }

  assertStreamBroadcaster(stream, req.user._id);

  const viewerId = req.params.viewerId;

  if (String(viewerId) === String(req.user._id)) {
    throw new AppError("You cannot moderate yourself.", {
      statusCode: 400,
      code: "LIVESTREAM_SELF_MODERATION"
    });
  }

  const viewer = await User.findById(viewerId).select("username avatarUrl");

  if (!viewer) {
    throw new AppError("Viewer not found.", {
      statusCode: 404,
      code: "LIVESTREAM_VIEWER_NOT_FOUND"
    });
  }

  let moderation = findViewerModeration(stream, viewerId);

  if (!moderation) {
    stream.viewerModeration.push({
      viewerId,
      strikes: 0
    });
    moderation = stream.viewerModeration[stream.viewerModeration.length - 1];
  }

  moderation.updatedAt = new Date();

  if (action === "mute") {
    moderation.mutedAt = moderation.mutedAt || new Date();
  }

  if (action === "kick") {
    moderation.kickedAt = moderation.kickedAt || new Date();
    stream.signalingTokens = stream.signalingTokens.filter(
      (entry) => String(entry.viewerId) !== String(viewerId)
    );
    stream.viewerCount = stream.signalingTokens.length;
  }

  await stream.save();

  const payload = {
    type: action === "kick" ? "stream:kicked" : "stream:viewer-muted",
    streamId: String(stream._id),
    targetUserId: String(viewerId),
    viewerId: String(viewerId),
    viewer: serializeBroadcaster(viewer),
    muted: Boolean(moderation.mutedAt),
    kicked: Boolean(moderation.kickedAt),
    viewerCount: stream.viewerCount,
    timestamp: Date.now()
  };

  publishToAll(payload);

  return {
    viewer: serializeBroadcaster(viewer),
    muted: Boolean(moderation.mutedAt),
    kicked: Boolean(moderation.kickedAt),
    viewerCount: stream.viewerCount
  };
}

export const muteLiveStreamViewer = asyncHandler(async (req, res) => {
  const result = await moderateLiveStreamViewer(req, { action: "mute" });

  res.status(200).json(result);
});

export const kickLiveStreamViewer = asyncHandler(async (req, res) => {
  const result = await moderateLiveStreamViewer(req, { action: "kick" });

  res.status(200).json(result);
});
