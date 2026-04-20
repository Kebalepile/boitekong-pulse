import { AppError } from "../utils/appError.js";
import { createFixedWindowRateLimiter } from "../utils/rateLimiter.js";

function readHeaderValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function trimString(value) {
  const rawValue = readHeaderValue(value);
  return typeof rawValue === "string" ? rawValue.trim() : "";
}

function normalizeKeyValue(value) {
  return trimString(value).toLowerCase();
}

function composeKey(prefix, value) {
  const normalizedValue = normalizeKeyValue(value);
  return normalizedValue ? `${prefix}:${normalizedValue}` : "";
}

export function getExpressClientIp(req) {
  const requestIp =
    req?.ip ||
    req?.socket?.remoteAddress ||
    req?.connection?.remoteAddress ||
    trimString(req?.headers?.["x-forwarded-for"]).split(",")[0];

  return normalizeKeyValue(requestIp);
}

export const rateLimitKeys = {
  ip(req) {
    return composeKey("ip", getExpressClientIp(req));
  },
  bodyField(req, fieldName) {
    return composeKey(`body:${fieldName}`, req?.body?.[fieldName]);
  },
  authenticatedUser(req) {
    return composeKey("user", req?.user?._id || req?.auth?.sub);
  }
};

export function createRateLimitMiddleware({
  windowMs,
  max,
  key,
  message,
  code,
  statusCode = 429
}) {
  const limiter = createFixedWindowRateLimiter({ windowMs, max });

  return function rateLimitMiddleware(req, res, next) {
    const bucketKey = typeof key === "function" ? key(req) : key;

    if (!bucketKey) {
      next();
      return;
    }

    const result = limiter.consume(bucketKey);

    if (result.allowed) {
      next();
      return;
    }

    if (result.retryAfterSeconds > 0) {
      res.setHeader("Retry-After", String(result.retryAfterSeconds));
    }

    next(
      new AppError(message, {
        statusCode,
        code,
        details: {
          retryAfterSeconds: result.retryAfterSeconds,
          limit: result.limit,
          windowSeconds: Math.ceil(Math.max(1000, Number(windowMs) || 60000) / 1000)
        }
      })
    );
  };
}
