import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { assertEnv } from './config/env.js';
import authRoutes from './routes/auth.js';
import queryRoutes from './routes/query.js';
import historyRoutes from './routes/history.js';
import ingestRoutes from './routes/ingest.js';

assertEnv();

const app = express();
app.set('trust proxy', 1); // behind a reverse proxy (HF Spaces / Render / etc.) — needed for rate limiting
app.disable('x-powered-by');

const corsOrigins = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({
  origin: corsOrigins.includes('*') ? '*' : corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '100kb' }));

app.use((req, res, next) => {
  console.log(`[backend] ${req.method} ${req.path}`); // path only — query strings may hold search terms
  next();
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
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

const port = Number(process.env.PORT) || 4000;
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
