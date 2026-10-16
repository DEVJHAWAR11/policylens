import Redis from 'ioredis';

// Optional shared Redis (Upstash, Render Redis, ...). Everything built on top of it
// falls back to per-process memory, so the app still runs — just without sharing.
let client = null;

if (process.env.REDIS_URL) {
  // log only scheme + host (never credentials) so a wrong URL is obvious in the logs
  try {
    const u = new URL(process.env.REDIS_URL.trim());
    console.log(`[redis] configured: scheme=${u.protocol.replace(':', '')} host=${u.hostname} port=${u.port || '(default)'} password=${u.password ? 'yes' : 'NO'}`);
    if (!['redis:', 'rediss:'].includes(u.protocol)) console.warn('[redis] REDIS_URL must start with redis:// or rediss:// (Upstash needs rediss://, not the https REST URL)');
    else if (u.protocol === 'redis:' && u.hostname.endsWith('upstash.io')) console.warn('[redis] Upstash requires TLS: use rediss:// (two s)');
  } catch {
    console.warn('[redis] REDIS_URL is not a valid URL');
  }
  client = new Redis(process.env.REDIS_URL.trim(), {
    maxRetriesPerRequest: 1,       // fail fast instead of stalling requests
    enableOfflineQueue: false,
    connectTimeout: 10000,   // TLS to a far-away region can exceed 3s
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 500, 10000),
  });
  client.on('error', (err) => {
    // ioredis emits on every failed reconnect; keep the log readable
    if (!client._lastErrLogged || Date.now() - client._lastErrLogged > 30000) {
      client._lastErrLogged = Date.now();
      console.warn('[redis] error:', err.message);
    }
  });
  client.on('ready', () => console.log('[redis] connected'));
}

export const redis = client;
export const redisReady = () => Boolean(client && client.status === 'ready');
