import { createHash } from "node:crypto";
import { User } from "../models/User.js";
import { verifyAccessToken } from "../utils/token.js";

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const userConnections = new Map();
const allConnections = new Set();
const socketState = new WeakMap();

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createWebSocketAccept(key) {
  return createHash("sha1")
    .update(`${key}${WEBSOCKET_GUID}`, "utf8")
    .digest("base64");
}

function writeHttpError(socket, statusCode, statusText) {
  if (socket.destroyed) {
    return;
  }

  socket.write(
    `HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`
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

  allConnections.delete(connection);

  const connectionsForUser = userConnections.get(connection.userId);

  if (connectionsForUser) {
    connectionsForUser.delete(connection);

    if (connectionsForUser.size === 0) {
      userConnections.delete(connection.userId);
    }
  }
}

function registerConnection(socket, userId) {
  const connection = {
    socket,
    userId,
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

async function authenticateUpgradeRequest(request) {
  const requestUrl = new URL(request.url || "/", "http://localhost");

  if (requestUrl.pathname !== "/api/realtime") {
    return {
      ok: false,
      statusCode: 404,
      statusText: "Not Found"
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

    const userExists = await User.exists({ _id: userId });

    if (!userExists) {
      return {
        ok: false,
        statusCode: 401,
        statusText: "Unauthorized"
      };
    }

    return {
      ok: true,
      userId
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
        writeHttpError(socket, authResult.statusCode, authResult.statusText);
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

      registerConnection(socket, authResult.userId);
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
