import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from './redis.js';

// Rate limiter factory. With REDIS_URL the counters are shared by every instance
// (otherwise each instance would allow its own full quota); without it, in-memory.
let counter = 0;

export function makeLimiter({ windowMs, limit, message, keyGenerator }) {
  const options = {
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message || 'Too many requests. Please try again later.' },
  };
  if (keyGenerator) options.keyGenerator = keyGenerator;
  if (redis) {
    options.store = new RedisStore({
      prefix: `rl:${++counter}:`,
      sendCommand: (...args) => redis.call(...args),
    });
    options.passOnStoreError = true; // if Redis blips, allow the request rather than fail it
  }
  return rateLimit(options);
}

export const perMinute = (limit, message) =>
  makeLimiter({ windowMs: 60 * 1000, limit, message });
export const perMinutes = (minutes, limit, message) =>
  makeLimiter({ windowMs: minutes * 60 * 1000, limit, message });
