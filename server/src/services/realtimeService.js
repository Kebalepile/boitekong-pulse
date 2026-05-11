import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import { LiveStream } from "../models/LiveStream.js";
import { User } from "../models/User.js";
import { verifyAccessToken } from "../utils/token.js";
import { createFixedWindowRateLimiter } from "../utils/rateLimiter.js";

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const realtimeUpgradeIpLimiter = createFixedWindowRateLimiter({
  windowMs: 60 * 1000,
  max: 30
});
const userConnections = new Map();
const allConnections = new Set();
const relayStreams = new Map();
const socketState = new WeakMap();
const STREAM_REALTIME_TYPES = new Set([
  "stream:comment",
  "stream:comment-moderation",
  "stream:reaction",
  "stream:offer",
  "stream:answer",
  "stream:ice-candidate",
  "stream:broadcaster-ready",
  "stream:media-state",
  "stream:relay-start",
  "stream:relay-stop",
  "stream:relay-chunk",
  "stream:relay-subscribe",
  "stream:relay-unsubscribe",
  "stream:relay-fallback-request"
]);
const MAX_STREAM_COMMENT_LENGTH = 500;
const MAX_RELAY_CHUNK_LENGTH = 2000000;
const ALLOWED_STREAM_REACTIONS = new Set([
  "\u2764\uFE0F",
  "\uD83D\uDC4F",
  "\uD83D\uDD25",
  "\uD83D\uDE02",
  "\uD83C\uDF89"
]);

function trimString(value) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return typeof rawValue === "string" ? rawValue.trim() : "";
}

function normalizePlainText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
}

function normalizeStreamCommentPayload(connection, payload, basePayload) {
  const text = normalizePlainText(payload.text, MAX_STREAM_COMMENT_LENGTH);

  if (!text) {
    return null;
  }

  return {
    ...basePayload,
    text,
    username: connection.username || "Neighbor"
  };
}

function normalizeStreamReactionPayload(payload, basePayload) {
  const reactionType = trimString(payload.reactionType);

  if (!ALLOWED_STREAM_REACTIONS.has(reactionType)) {
    return null;
  }

  return {
    ...basePayload,
    reactionType
  };
}

function normalizeStreamCommentModerationPayload(payload, basePayload) {
  const targetUserId = trimString(payload.targetUserId);
  const action = trimString(payload.action).toLowerCase();

  if (!targetUserId || (action !== "like" && action !== "heart")) {
    return null;
  }

  return {
    ...basePayload,
    targetUserId,
    action,
    streamerName: normalizePlainText(payload.streamerName, 30) || "Streamer",
    text: normalizePlainText(payload.text, 120)
  };
}

function normalizeStreamRelayPayload(payload, basePayload) {
  if (
    basePayload.type === "stream:relay-subscribe" ||
    basePayload.type === "stream:relay-unsubscribe" ||
    basePayload.type === "stream:relay-fallback-request"
  ) {
    return basePayload;
  }

  if (basePayload.type === "stream:relay-stop") {
    return {
      ...basePayload,
      reason: normalizePlainText(payload.reason, 80)
    };
  }

  const mimeType = normalizePlainText(payload.mimeType, 120);

  if (basePayload.type === "stream:relay-start") {
    return {
      ...basePayload,
      mimeType
    };
  }

  const chunk = typeof payload.chunk === "string"
    ? payload.chunk.trim().replace(/[\r\n\s]/g, "")
    : "";

  if (
    !chunk ||
    chunk.length > MAX_RELAY_CHUNK_LENGTH ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(chunk)
  ) {
    return null;
  }

  return {
    ...basePayload,
    chunk,
    mimeType,
    sequence: Math.max(Number(payload.sequence) || 0, 0),
    isInit: payload.isInit === true
  };
}

function normalizeOrigin(origin = "") {
  try {
    const parsed = new URL(origin);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }

    return parsed.origin;
  } catch {
    return "";
  }
}

function shouldTrustForwardedHeaders() {
  if (env.trustProxy === false || env.trustProxy === 0) {
    return false;
  }

  if (typeof env.trustProxy === "string") {
    const normalizedValue = env.trustProxy.trim().toLowerCase();
    return normalizedValue !== "false" && normalizedValue !== "0";
  }

  return true;
}

function resolveUpgradeClientIp(request) {
  if (shouldTrustForwardedHeaders()) {
    const forwardedFor = trimString(request?.headers?.["x-forwarded-for"]);

    if (forwardedFor) {
      return trimString(forwardedFor.split(",")[0]).toLowerCase();
    }
  }

  return trimString(request?.socket?.remoteAddress || request?.headers?.["x-real-ip"]).toLowerCase();
}

function hasRestrictedOrigins() {
  return env.corsOrigins.length > 0 && !env.corsOrigins.includes("*");
}

function isRealtimeOriginAllowed(origin) {
  if (!hasRestrictedOrigins()) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin || "");
  return Boolean(normalizedOrigin) && env.corsOrigins.includes(normalizedOrigin);
}

function createWebSocketAccept(key) {
  return createHash("sha1")
    .update(`${key}${WEBSOCKET_GUID}`, "utf8")
    .digest("base64");
}

function writeHttpError(socket, statusCode, statusText, headers = {}) {
  if (socket.destroyed) {
    return;
  }

  const headerLines = Object.entries(headers).map(([key, value]) => `${key}: ${value}`);

  socket.write(
    [
      `HTTP/1.1 ${statusCode} ${statusText}`,
      "Connection: close",
      "Content-Length: 0",
      ...headerLines,
      "\r\n"
    ].join("\r\n")
  );
  socket.destroy();
}

function encodeFrame(opcode, payloadBuffer = Buffer.alloc(0)) {
  const payload = Buffer.isBuffer(payloadBuffer)
    ? payloadBuffer
    : Buffer.from(payloadBuffer);
  const payloadLength = payload.length;
  let headerLength = 2;

  if (payloadLength >= 126 && payloadLength <= 65535) {
    headerLength += 2;
  } else if (payloadLength > 65535) {
    headerLength += 8;
  }

  const frame = Buffer.alloc(headerLength + payloadLength);
  frame[0] = 0x80 | (opcode & 0x0f);

  if (payloadLength < 126) {
    frame[1] = payloadLength;
    payload.copy(frame, 2);
    return frame;
  }

  if (payloadLength <= 65535) {
    frame[1] = 126;
    frame.writeUInt16BE(payloadLength, 2);
    payload.copy(frame, 4);
    return frame;
  }

  frame[1] = 127;
  frame.writeBigUInt64BE(BigInt(payloadLength), 2);
  payload.copy(frame, 10);
  return frame;
}

function sendFrame(socket, opcode, payloadBuffer = Buffer.alloc(0)) {
  if (!socket || socket.destroyed || !socket.writable) {
    return false;
  }

  try {
    socket.write(encodeFrame(opcode, payloadBuffer));
    return true;
  } catch {
    return false;
  }
}

function sendJson(socket, payload) {
  return sendFrame(socket, 0x1, Buffer.from(JSON.stringify(payload), "utf8"));
}

function sendPong(socket, payloadBuffer = Buffer.alloc(0)) {
  return sendFrame(socket, 0xA, payloadBuffer);
}

function sendClose(socket, code = 1000) {
  const payload = Buffer.alloc(2);
  payload.writeUInt16BE(code, 0);
  return sendFrame(socket, 0x8, payload);
}

function consumeFrames(buffer, onFrame) {
  let offset = 0;

  while (buffer.length - offset >= 2) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    let payloadLength = secondByte & 0x7f;
    let headerLength = 2;

    if (payloadLength === 126) {
      if (buffer.length - offset < 4) {
        break;
      }

      payloadLength = buffer.readUInt16BE(offset + 2);
      headerLength += 2;
    } else if (payloadLength === 127) {
      if (buffer.length - offset < 10) {
        break;
      }

      const bigLength = buffer.readBigUInt64BE(offset + 2);

      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Unsupported websocket frame length.");
      }

      payloadLength = Number(bigLength);
      headerLength += 8;
    }

    const masked = Boolean(secondByte & 0x80);
    let maskOffset = offset + headerLength;

    if (masked) {
      if (buffer.length - offset < headerLength + 4) {
        break;
      }

      headerLength += 4;
      maskOffset = offset + headerLength - 4;
    }

    if (buffer.length - offset < headerLength + payloadLength) {
      break;
    }

    let payload = buffer.subarray(offset + headerLength, offset + headerLength + payloadLength);

    if (masked) {
      const mask = buffer.subarray(maskOffset, maskOffset + 4);
      const unmaskedPayload = Buffer.alloc(payload.length);

      for (let index = 0; index < payload.length; index += 1) {
        unmaskedPayload[index] = payload[index] ^ mask[index % 4];
      }

      payload = unmaskedPayload;
    }

    onFrame({
      opcode: firstByte & 0x0f,
      payload
    });

    offset += headerLength + payloadLength;
  }

  return buffer.subarray(offset);
}

function removeConnection(connection) {
  if (!connection) {
    return;
  }

  cleanupRelayConnection(connection);
  allConnections.delete(connection);

  const connectionsForUser = userConnections.get(connection.userId);

  if (connectionsForUser) {
    connectionsForUser.delete(connection);

    if (connectionsForUser.size === 0) {
      userConnections.delete(connection.userId);
    }
  }
}

function getRelayStreamState(streamId) {
  const safeStreamId = trimString(streamId);

  if (!safeStreamId) {
    return null;
  }

  if (!relayStreams.has(safeStreamId)) {
    relayStreams.set(safeStreamId, {
      broadcasterId: "",
      mimeType: "",
      sequence: 0,
      initChunk: "",
      subscribers: new Set()
    });
  }

  return relayStreams.get(safeStreamId);
}

function sendRelayPayloadToSubscribers(streamId, payload, { includePublisher = false } = {}) {
  const relayState = relayStreams.get(trimString(streamId));

  if (!relayState) {
    return 0;
  }

  let sentCount = 0;

  Array.from(relayState.subscribers).forEach((connection) => {
    if (!includePublisher && connection.userId === relayState.broadcasterId) {
      return;
    }

    if (sendJson(connection.socket, payload)) {
      sentCount += 1;
      return;
    }

    removeConnection(connection);
  });

  return sentCount;
}

function cleanupRelayConnection(connection) {
  relayStreams.forEach((relayState, streamId) => {
    relayState.subscribers.delete(connection);

    if (relayState.broadcasterId === connection.userId) {
      sendRelayPayloadToSubscribers(streamId, {
        type: "stream:relay-stop",
        streamId,
        userId: connection.userId,
        timestamp: Date.now()
      });
      relayStreams.delete(streamId);
    } else if (!relayState.broadcasterId && relayState.subscribers.size === 0) {
      relayStreams.delete(streamId);
    }
  });

  connection.relaySubscriptions?.clear();
}

async function isActiveStreamBroadcaster(streamId, userId) {
  const safeStreamId = trimString(streamId);
  const safeUserId = trimString(userId);

  if (!safeStreamId || !safeUserId) {
    return false;
  }

  try {
    const stream = await LiveStream.findById(safeStreamId).select("broadcasterId status").lean();

    return Boolean(
      stream &&
        stream.status === "active" &&
        String(stream.broadcasterId) === safeUserId
    );
  } catch {
    return false;
  }
}

async function canPublishStreamChatPayload(streamId, userId) {
  const safeStreamId = trimString(streamId);
  const safeUserId = trimString(userId);

  if (!safeStreamId || !safeUserId) {
    return false;
  }

  try {
    const stream = await LiveStream.findById(safeStreamId)
      .select("broadcasterId status viewerModeration.viewerId viewerModeration.mutedAt viewerModeration.kickedAt")
      .lean();

    if (!stream || stream.status !== "active") {
      return false;
    }

    if (String(stream.broadcasterId) === safeUserId) {
      return true;
    }

    const moderation = (stream.viewerModeration || []).find(
      (entry) => String(entry.viewerId) === safeUserId
    );

    return !moderation?.mutedAt && !moderation?.kickedAt;
  } catch {
    return false;
  }
}

function registerConnection(socket, userId, username = "") {
  const connection = {
    socket,
    userId,
    username: normalizePlainText(username, 30) || "Neighbor",
    relaySubscriptions: new Set(),
    buffer: Buffer.alloc(0)
  };

  allConnections.add(connection);

  if (!userConnections.has(userId)) {
    userConnections.set(userId, new Set());
  }

  userConnections.get(userId).add(connection);
  socketState.set(socket, connection);

  const cleanup = () => {
    removeConnection(connection);
  };

  socket.on("data", (chunk) => {
    const currentConnection = socketState.get(socket);

    if (!currentConnection) {
      return;
    }

    try {
      currentConnection.buffer = consumeFrames(
        Buffer.concat([currentConnection.buffer, chunk]),
        ({ opcode, payload }) => {
          if (opcode === 0x8) {
            sendClose(socket, 1000);
            socket.end();
            return;
          }

          if (opcode === 0x9) {
            sendPong(socket, payload);
            return;
          }

          if (opcode === 0x1) {
            void handleClientMessage(currentConnection, payload).catch(() => {});
          }
        }
      );
    } catch {
      sendClose(socket, 1002);
      socket.destroy();
    }
  });

  socket.on("close", cleanup);
  socket.on("end", cleanup);
  socket.on("error", cleanup);

  sendJson(socket, {
    type: "realtime.connected",
    userId
  });
}

function parseJsonPayload(payload) {
  try {
    return JSON.parse(payload.toString("utf8"));
  } catch {
    return null;
  }
}

function normalizeClientRealtimePayload(connection, payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const type = trimString(payload.type);

  if (!STREAM_REALTIME_TYPES.has(type)) {
    return null;
  }

  const streamId = trimString(payload.streamId);

  if (!streamId) {
    return null;
  }

  const basePayload = {
    type,
    streamId,
    userId: connection.userId,
    timestamp: Number.isFinite(payload.timestamp) ? payload.timestamp : Date.now()
  };

  if (type === "stream:comment") {
    return normalizeStreamCommentPayload(connection, payload, basePayload);
  }

  if (type === "stream:reaction") {
    return normalizeStreamReactionPayload(payload, basePayload);
  }

  if (type === "stream:comment-moderation") {
    return normalizeStreamCommentModerationPayload(payload, basePayload);
  }

  if (type.startsWith("stream:relay-")) {
    return normalizeStreamRelayPayload(payload, basePayload);
  }

  return {
    ...payload,
    ...basePayload
  };
}

async function handleRelayClientMessage(connection, payload) {
  const relayState = getRelayStreamState(payload.streamId);

  if (!relayState) {
    return;
  }

  if (payload.type === "stream:relay-subscribe") {
    relayState.subscribers.add(connection);
    connection.relaySubscriptions.add(payload.streamId);

    if (relayState.broadcasterId && relayState.mimeType) {
      sendJson(connection.socket, {
        type: "stream:relay-start",
        streamId: payload.streamId,
        userId: relayState.broadcasterId,
        mimeType: relayState.mimeType,
        timestamp: Date.now()
      });
    }

    if (relayState.initChunk) {
      sendJson(connection.socket, {
        type: "stream:relay-chunk",
        streamId: payload.streamId,
        userId: relayState.broadcasterId,
        mimeType: relayState.mimeType,
        chunk: relayState.initChunk,
        sequence: 0,
        isInit: true,
        timestamp: Date.now()
      });
    }

    return;
  }

  if (payload.type === "stream:relay-unsubscribe") {
    relayState.subscribers.delete(connection);
    connection.relaySubscriptions.delete(payload.streamId);
    return;
  }

  if (payload.type === "stream:relay-fallback-request") {
    if (relayState.broadcasterId) {
      publishToUser(relayState.broadcasterId, {
        ...payload,
        viewerId: connection.userId,
        timestamp: Date.now()
      });
    }
    return;
  }

  if (!(await isActiveStreamBroadcaster(payload.streamId, connection.userId))) {
    return;
  }

  if (payload.type === "stream:relay-start") {
    relayState.broadcasterId = connection.userId;
    relayState.mimeType = payload.mimeType || "video/webm";
    relayState.sequence = 0;
    relayState.initChunk = "";
    relayState.subscribers.add(connection);

    sendRelayPayloadToSubscribers(payload.streamId, {
      ...payload,
      userId: connection.userId,
      timestamp: Date.now()
    });
    return;
  }

  if (relayState.broadcasterId !== connection.userId) {
    return;
  }

  if (payload.type === "stream:relay-stop") {
    sendRelayPayloadToSubscribers(payload.streamId, {
      ...payload,
      userId: connection.userId,
      timestamp: Date.now()
    });
    relayStreams.delete(payload.streamId);
    return;
  }

  if (payload.type === "stream:relay-chunk") {
    relayState.sequence = Math.max(relayState.sequence, payload.sequence);
    relayState.mimeType = payload.mimeType || relayState.mimeType || "video/webm";

    if (payload.isInit || !relayState.initChunk) {
      relayState.initChunk = payload.chunk;
    }

    sendRelayPayloadToSubscribers(payload.streamId, {
      ...payload,
      userId: connection.userId,
      mimeType: relayState.mimeType,
      timestamp: Date.now()
    });
  }
}

async function handleClientMessage(connection, payloadBuffer) {
  const payload = normalizeClientRealtimePayload(connection, parseJsonPayload(payloadBuffer));

  if (!payload) {
    return;
  }

  if (payload.type.startsWith("stream:relay-")) {
    await handleRelayClientMessage(connection, payload);
    return;
  }

  if (
    (payload.type === "stream:comment" || payload.type === "stream:reaction") &&
    !(await canPublishStreamChatPayload(payload.streamId, connection.userId))
  ) {
    return;
  }

  if (payload.type === "stream:comment-moderation") {
    if (!(await isActiveStreamBroadcaster(payload.streamId, connection.userId))) {
      return;
    }

    publishToUser(payload.targetUserId, payload);
    return;
  }

  publishToAll(payload);
}

async function authenticateUpgradeRequest(request) {
  const requestUrl = new URL(request.url || "/", "http://localhost");

  if (requestUrl.pathname !== "/api/realtime") {
    return {
      ok: false,
      statusCode: 404,
      statusText: "Not Found"
    };
  }

  const upgradeHeader = trimString(request.headers.upgrade).toLowerCase();

  if (upgradeHeader !== "websocket") {
    return {
      ok: false,
      statusCode: 400,
      statusText: "Bad Request"
    };
  }

  const websocketVersion = trimString(request.headers["sec-websocket-version"]);

  if (websocketVersion && websocketVersion !== "13") {
    return {
      ok: false,
      statusCode: 400,
      statusText: "Bad Request"
    };
  }

  if (!isRealtimeOriginAllowed(request.headers.origin)) {
    return {
      ok: false,
      statusCode: 403,
      statusText: "Forbidden"
    };
  }

  const clientIp = resolveUpgradeClientIp(request) || "unknown";
  const rateLimitResult = realtimeUpgradeIpLimiter.consume(`realtime:${clientIp}`);

  if (!rateLimitResult.allowed) {
    return {
      ok: false,
      statusCode: 429,
      statusText: "Too Many Requests",
      headers: {
        "Retry-After": String(rateLimitResult.retryAfterSeconds)
      }
    };
  }

  const accessToken = trimString(
    requestUrl.searchParams.get("access_token") || requestUrl.searchParams.get("token")
  );

  if (!accessToken) {
    return {
      ok: false,
      statusCode: 401,
      statusText: "Unauthorized"
    };
  }

  try {
    const payload = verifyAccessToken(accessToken);
    const userId = trimString(payload?.sub);

    if (!userId) {
      return {
        ok: false,
        statusCode: 401,
        statusText: "Unauthorized"
      };
    }

    const user = await User.findById(userId).select("username").lean();

    if (!user) {
      return {
        ok: false,
        statusCode: 401,
        statusText: "Unauthorized"
      };
    }

    return {
      ok: true,
      userId,
      username: trimString(user.username)
    };
  } catch {
    return {
      ok: false,
      statusCode: 401,
      statusText: "Unauthorized"
    };
  }
}

export function attachRealtimeServer(server) {
  if (!server || typeof server.on !== "function") {
    return;
  }

  server.on("upgrade", (request, socket) => {
    socket.on("error", () => {});

    void (async () => {
      const authResult = await authenticateUpgradeRequest(request);

      if (!authResult.ok) {
        writeHttpError(socket, authResult.statusCode, authResult.statusText, authResult.headers);
        return;
      }

      const key = trimString(request.headers["sec-websocket-key"]);

      if (!key) {
        writeHttpError(socket, 400, "Bad Request");
        return;
      }

      const acceptValue = createWebSocketAccept(key);

      socket.write(
        [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${acceptValue}`,
          "\r\n"
        ].join("\r\n")
      );

      registerConnection(socket, authResult.userId, authResult.username);
    })().catch(() => {
      writeHttpError(socket, 500, "Internal Server Error");
    });
  });
}

export function publishToUser(userId, payload) {
  const safeUserId = trimString(userId);

  if (!safeUserId) {
    return 0;
  }

  const connections = userConnections.get(safeUserId);

  if (!connections || connections.size === 0) {
    return 0;
  }

  let sentCount = 0;

  connections.forEach((connection) => {
    if (sendJson(connection.socket, payload)) {
      sentCount += 1;
      return;
    }

    removeConnection(connection);
  });

  return sentCount;
}

export function publishToUsers(userIds, payload) {
  const uniqueUserIds = Array.from(new Set((Array.isArray(userIds) ? userIds : []).map(trimString).filter(Boolean)));

  return uniqueUserIds.reduce((sentCount, userId) => sentCount + publishToUser(userId, payload), 0);
}

export function publishToAll(payload) {
  let sentCount = 0;

  allConnections.forEach((connection) => {
    if (sendJson(connection.socket, payload)) {
      sentCount += 1;
      return;
    }

    removeConnection(connection);
  });

  return sentCount;
}

export function stopStreamRelay(streamId, reason = "ended") {
  const safeStreamId = trimString(streamId);
  const relayState = relayStreams.get(safeStreamId);

  if (!relayState) {
    return 0;
  }

  const sentCount = sendRelayPayloadToSubscribers(safeStreamId, {
    type: "stream:relay-stop",
    streamId: safeStreamId,
    userId: relayState.broadcasterId,
    reason,
    timestamp: Date.now()
  }, { includePublisher: true });

  relayStreams.delete(safeStreamId);
  return sentCount;
}

export function closeRealtimeServer() {
  Array.from(allConnections).forEach((connection) => {
    try {
      sendClose(connection.socket, 1001);
      connection.socket.end();
    } catch {
      connection.socket.destroy();
    } finally {
      removeConnection(connection);
    }
  });
}
