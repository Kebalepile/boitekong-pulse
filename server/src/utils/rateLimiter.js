function normalizeKey(key) {
  return typeof key === "string" ? key.trim().toLowerCase() : "";
}

export function createFixedWindowRateLimiter({ windowMs, max }) {
  const safeWindowMs = Math.max(1000, Number(windowMs) || 60000);
  const safeMax = Math.max(1, Number(max) || 1);
  const buckets = new Map();
  let nextSweepAt = 0;

  function sweep(now) {
    if (now < nextSweepAt) {
      return;
    }

    nextSweepAt = now + safeWindowMs;

    for (const [key, entry] of buckets.entries()) {
      if (!entry || entry.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }

  function createWindow(now) {
    return {
      count: 0,
      resetAt: now + safeWindowMs
    };
  }

  return {
    consume(key, { now = Date.now() } = {}) {
      const normalizedKey = normalizeKey(key);

      if (!normalizedKey) {
        return {
          allowed: true,
          limit: safeMax,
          remaining: safeMax,
          resetAt: now + safeWindowMs,
          retryAfterMs: 0,
          retryAfterSeconds: 0
        };
      }

      sweep(now);

      let entry = buckets.get(normalizedKey);

      if (!entry || entry.resetAt <= now) {
        entry = createWindow(now);
        buckets.set(normalizedKey, entry);
      }

      entry.count += 1;

      const allowed = entry.count <= safeMax;
      const retryAfterMs = allowed ? 0 : Math.max(0, entry.resetAt - now);

      return {
        allowed,
        limit: safeMax,
        remaining: Math.max(0, safeMax - entry.count),
        resetAt: entry.resetAt,
        retryAfterMs,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000)
      };
    },
    reset(key) {
      const normalizedKey = normalizeKey(key);

      if (normalizedKey) {
        buckets.delete(normalizedKey);
      }
    }
  };
}
