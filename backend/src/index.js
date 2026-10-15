import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { assertEnv } from './config/env.js';
import { supabase } from './config/supabase.js';
import { pythonApi } from './config/python.js';
import { redis, redisReady } from './utils/redis.js';
import { breakerState } from './utils/resilience.js';
import authRoutes from './routes/auth.js';
import queryRoutes from './routes/query.js';
import historyRoutes from './routes/history.js';
import ingestRoutes from './routes/ingest.js';

assertEnv();

const app = express();
app.set('trust proxy', 1); // behind a reverse proxy (Render / HF / etc.) — needed for rate limiting
app.disable('x-powered-by');

const corsOrigins = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({
  origin: corsOrigins.includes('*') ? '*' : corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
  exposedHeaders: ['Retry-After', 'X-Request-Id'],
}));
// Compress JSON, but never the token stream (buffering would defeat streaming)
app.use(compression({ filter: (req, res) => !req.path.endsWith('/query/stream') && compression.filter(req, res) }));
app.use(express.json({ limit: '100kb' }));

// Request id + latency log (path only — query strings may hold search terms)
app.use((req, res, next) => {
  const id = req.get('x-request-id') || crypto.randomUUID().slice(0, 12);
  const started = process.hrtime.bigint();
  res.setHeader('X-Request-Id', id);
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    if (req.path !== '/api/health') {
      console.log(`[backend] id=${id} ${req.method} ${req.path} -> ${res.statusCode} ${ms.toFixed(0)}ms`);
    }
  });
  next();
});

// Liveness: cheap, no dependencies — used by the platform health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Readiness: checks every dependency and reports what is degraded
app.get('/api/health/deep', async (req, res) => {
  const withTimeout = (p, ms = 4000) =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  const check = async (fn) => {
    const started = Date.now();
    try {
      await withTimeout(fn());
      return { ok: true, ms: Date.now() - started };
    } catch (err) {
      return { ok: false, ms: Date.now() - started, error: err.message };
    }
  };

  const [database, python, cache] = await Promise.all([
    check(async () => {
      const { error } = await supabase.from('policies').select('policy_id').limit(1);
      if (error) throw new Error(error.message);
    }),
    check(() => pythonApi.get('/', { timeout: 4000 })),
    redis ? check(() => redis.ping()) : Promise.resolve({ ok: true, ms: 0, note: 'not configured (memory fallback)' }),
  ]);

  const breaker = breakerState();
  const ok = database.ok; // chat/upload need the DB; the others degrade gracefully
  res.status(ok ? 200 : 503).json({
    status: ok && python.ok && cache.ok && !breaker.open ? 'ok' : ok ? 'degraded' : 'down',
    database, python, cache,
    redis: redis ? (redisReady() ? 'connected' : 'disconnected') : 'disabled',
    pythonCircuit: breaker,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api', queryRoutes);
app.use('/api', historyRoutes);
app.use('/api', ingestRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[backend] Unhandled error:', err.message);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: err.status && err.status < 500 ? err.message : 'Internal server error' });
});

// Last-resort guards: log and keep serving rather than crash on a stray rejection
process.on('unhandledRejection', (reason) => console.error('[backend] unhandledRejection:', reason));

const port = Number(process.env.PORT) || 4000;
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
// keep-alive longer than typical proxy idle timeouts avoids sporadic 502s behind load balancers
server.keepAliveTimeout = 75_000;
server.headersTimeout = 80_000;

// Graceful shutdown (deploys / scale-down): stop accepting, let in-flight requests finish
const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 25_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
