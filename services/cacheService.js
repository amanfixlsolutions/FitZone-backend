/**
 * cacheService.js — in-memory response cache with TTL
 * Used for analytics endpoints to reduce DB load.
 */

const cache = new Map(); // key → { data, expiresAt }
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

exports.get = (key) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
};

exports.set = (key, data, ttlMs = DEFAULT_TTL_MS) => {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
};

exports.del = (key) => cache.delete(key);

exports.clear = () => cache.clear();

exports.size = () => cache.size;

// ── Express middleware factory ─────────────────────────────────────
// Usage: router.get("/endpoint", cacheMiddleware("key", 300000), handler)
exports.cacheMiddleware = (keyFn, ttlMs = DEFAULT_TTL_MS) => (req, res, next) => {
  const key = typeof keyFn === "function" ? keyFn(req) : keyFn;
  const cached = exports.get(key);
  if (cached) {
    return res.json({ ...cached, _cached: true });
  }
  // Intercept res.json to cache the response
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode === 200 && body?.success) {
      exports.set(key, body, ttlMs);
    }
    return originalJson(body);
  };
  next();
};
