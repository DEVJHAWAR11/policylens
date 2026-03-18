import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import queryRoutes from './routes/query.js';
import historyRoutes from './routes/history.js';
import ingestRoutes from './routes/ingest.js';

const app = express();

const corsOrigins = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: corsOrigins.includes('*') ? '*' : corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());        // parse JSON request bodies

app.use((req, res, next) => {
  console.log(`[backend] ${req.method} ${req.url}`);
  next();
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', message: 'Node backend is reaching out' }));
app.use('/api/auth', authRoutes);
app.use('/api', queryRoutes);
app.use('/api', historyRoutes);
app.use('/api', ingestRoutes);

const port = Number(process.env.PORT) || 4000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
