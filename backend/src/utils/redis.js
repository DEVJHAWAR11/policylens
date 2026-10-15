import Redis from 'ioredis';

// Optional shared Redis (Upstash, Render Redis, ...). Everything built on top of it
// falls back to per-process memory, so the app still runs — just without sharing.
let client = null;

if (process.env.REDIS_URL) {
  client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,       // fail fast instead of stalling requests
    enableOfflineQueue: false,
    connectTimeout: 3000,
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
