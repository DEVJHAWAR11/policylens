import { redis, redisReady } from './redis.js';

// Tiny TTL cache: Redis when available (shared across instances), otherwise memory.
// All operations are best-effort — a cache problem must never fail a request.
const MAX_ITEMS = 5000;
const memory = new Map(); // key -> { value, expires }

function memGet(key) {
  const hit = memory.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    memory.delete(key);
    return undefined;
  }
  return hit.value;
}

function memSet(key, value, ttlSeconds) {
  if (memory.size >= MAX_ITEMS) memory.delete(memory.keys().next().value); // evict oldest
  memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
}

export async function cacheGet(key) {
  const local = memGet(key);
  if (local !== undefined) return local;
  if (!redisReady()) return undefined;
  try {
    const raw = await redis.get(key);
    if (raw === null) return undefined;
    const value = JSON.parse(raw);
    memSet(key, value, 5); // brief local copy avoids a Redis round trip on bursts
    return value;
  } catch {
    return undefined;
  }
}

export async function cacheSet(key, value, ttlSeconds) {
  memSet(key, value, ttlSeconds);
  if (!redisReady()) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch { /* best effort */ }
}

export async function cacheDel(key) {
  memory.delete(key);
  if (!redisReady()) return;
  try {
    await redis.del(key);
  } catch { /* best effort */ }
}
