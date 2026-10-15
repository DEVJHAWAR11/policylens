import 'dotenv/config';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'JWT_SECRET', 'PYTHON_API_URL'];

export const isProd = process.env.NODE_ENV === 'production';

export function assertEnv() {
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`[config] Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (process.env.JWT_SECRET.length < 32) {
    console.warn('[config] JWT_SECRET is shorter than 32 characters — use a long random value.');
  }
  if (isProd && (process.env.CORS_ORIGINS || '*') === '*') {
    console.warn('[config] CORS_ORIGINS is "*" in production — restrict it to your frontend origin(s).');
  }
  if (!process.env.INTERNAL_API_KEY) {
    console.warn('[config] INTERNAL_API_KEY not set — the Python API is not protected from direct access.');
  }
}
