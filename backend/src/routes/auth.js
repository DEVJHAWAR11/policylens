import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { sendResetCodeEmail } from '../utils/mailer.js';
import { perMinutes } from '../utils/limiter.js';

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RESET_ATTEMPTS = 5;
const RESET_CODE_TTL_MS = 10 * 60 * 1000;

const limiter = (max, windowMinutes = 15) => perMinutes(windowMinutes, max);

const normalizeEmail = (email) =>
  typeof email === 'string' ? email.toLowerCase().trim() : '';

const hashCode = (email, code) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${email}:${code}`).digest('hex');

const safeEqual = (a, b) => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

// bcrypt silently truncates input at 72 bytes
const validPassword = (pw) =>
  typeof pw === 'string' && pw.length >= 8 && Buffer.byteLength(pw) <= 72;

const signSession = (user) =>
  jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: '7d',
    algorithm: 'HS256',
  });

router.use(limiter(40));

// --------------------------------------------------------
// POST /api/auth/signup
// --------------------------------------------------------
router.post('/signup', async (req, res) => {
  const { password, name } = req.body || {};
  const email = normalizeEmail(req.body?.email);

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required' });
  if (!validPassword(password)) {
    return res.status(400).json({ error: 'Password must be 8–72 characters' });
  }
  const safeName = typeof name === 'string' ? name.trim().slice(0, 100) : '';

  const { data: existing } = await supabase
    .from('users').select('id').eq('email', email).maybeSingle();
  if (existing) return res.status(400).json({ error: 'Email already exists' });

  const password_hash = await bcrypt.hash(password, 10);
  const { data: user, error } = await supabase
    .from('users')
    .insert({ email, password_hash, name: safeName || email.split('@')[0] })
    .select()
    .single();
  if (error) {
    console.error('[auth] signup failed:', error.message);
    return res.status(500).json({ error: 'Could not create account' });
  }

  res.json({ token: signSession(user), user: { id: user.id, email, name: user.name } });
});

// --------------------------------------------------------
// POST /api/auth/login
// --------------------------------------------------------
router.post('/login', limiter(10), async (req, res) => {
  const { password } = req.body || {};
  const email = normalizeEmail(req.body?.email);
  if (!email || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { data: user } = await supabase
    .from('users').select('*').eq('email', email).maybeSingle();

  // Always run a bcrypt compare so response time doesn't reveal whether the email exists
  const hash = user?.password_hash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid.';
  const valid = await bcrypt.compare(password, hash);
  if (!user || !valid) return res.status(401).json({ error: 'Invalid credentials' });

  res.json({ token: signSession(user), user: { id: user.id, email, name: user.name } });
});

// --------------------------------------------------------
// POST /api/auth/google
// Exchanges a *verified* Supabase OAuth access token for our session JWT.
// The email is taken from the verified token — never from the request body.
// --------------------------------------------------------
router.post('/google', async (req, res) => {
  const header = req.headers.authorization || '';
  const accessToken =
    (header.startsWith('Bearer ') ? header.slice(7) : null) || req.body?.access_token;

  if (!accessToken || typeof accessToken !== 'string') {
    return res.status(401).json({ error: 'Missing OAuth access token' });
  }

  const { data: { user: authUser } = {}, error: authError } =
    await supabase.auth.getUser(accessToken);
  if (authError || !authUser?.email) {
    return res.status(401).json({ error: 'Invalid OAuth token' });
  }

  const email = authUser.email.toLowerCase().trim();
  const meta = authUser.user_metadata || {};
  const displayName = String(meta.full_name || meta.name || email.split('@')[0]).slice(0, 100);

  let { data: user } = await supabase
    .from('users').select('*').eq('email', email).maybeSingle();

  if (!user) {
    const { data: newUser, error } = await supabase
      .from('users')
      // password_hash is NOT NULL; this value can never match a bcrypt compare
      .insert({ email, password_hash: 'google_oauth', name: displayName })
      .select()
      .single();
    if (error) {
      console.error('[auth] google sign-in user create failed:', error.message);
      return res.status(500).json({ error: 'Could not create account' });
    }
    user = newUser;
  }

  res.json({ token: signSession({ id: user.id, email }), user: { id: user.id, email, name: user.name } });
});

// --------------------------------------------------------
// POST /api/auth/forgot-password
// --------------------------------------------------------
router.post('/forgot-password', limiter(5), async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email is required' });

  const generic = { success: true, message: 'If that email exists, a code has been sent.' };

  const { data: user } = await supabase
    .from('users').select('id').eq('email', email).maybeSingle();
  if (!user) return res.json(generic); // no account enumeration

  await supabase
    .from('password_reset_codes').update({ used: true }).eq('email', email).eq('used', false);

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const { error } = await supabase.from('password_reset_codes').insert({
    email,
    code: hashCode(email, code), // only a keyed hash is stored
    expires_at: new Date(Date.now() + RESET_CODE_TTL_MS).toISOString(),
  });
  if (error) {
    console.error('[auth] Failed to store reset code:', error.message);
    return res.status(500).json({ error: 'Failed to generate reset code' });
  }

  await sendResetCodeEmail(email, code);
  res.json(generic);
});

// --------------------------------------------------------
// POST /api/auth/verify-reset-code
// --------------------------------------------------------
router.post('/verify-reset-code', limiter(15), async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!email || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Email and a 6-digit code are required' });
  }

  const { data: record } = await supabase
    .from('password_reset_codes')
    .select('*')
    .eq('email', email)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const invalid = () => res.status(400).json({ error: 'Invalid or expired code' });
  if (!record) return invalid();

  if (new Date(record.expires_at) < new Date()) {
    await supabase.from('password_reset_codes').update({ used: true }).eq('id', record.id);
    return invalid();
  }

  if (!safeEqual(record.code, hashCode(email, code))) {
    const attempts = (record.attempts || 0) + 1;
    await supabase
      .from('password_reset_codes')
      .update({ attempts, used: attempts >= MAX_RESET_ATTEMPTS })
      .eq('id', record.id);
    return invalid();
  }

  await supabase.from('password_reset_codes').update({ used: true }).eq('id', record.id);

  const resetToken = jwt.sign(
    { email, purpose: 'password_reset' },
    process.env.JWT_SECRET,
    { expiresIn: '5m', algorithm: 'HS256' }
  );
  res.json({ success: true, resetToken });
});

// --------------------------------------------------------
// POST /api/auth/reset-password
// --------------------------------------------------------
router.post('/reset-password', limiter(10), async (req, res) => {
  const { resetToken, password, newPassword } = req.body || {};
  const targetPassword = password || newPassword;
  if (!resetToken || !targetPassword) {
    return res.status(400).json({ error: 'Reset token and new password are required' });
  }
  if (!validPassword(targetPassword)) {
    return res.status(400).json({ error: 'Password must be 8–72 characters' });
  }

  let decoded;
  try {
    decoded = jwt.verify(resetToken, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (decoded.purpose !== 'password_reset') throw new Error('Invalid token purpose');
  } catch {
    return res.status(400).json({ error: 'Invalid or expired reset token. Please start over.' });
  }

  const password_hash = await bcrypt.hash(targetPassword, 10);
  const { error } = await supabase
    .from('users').update({ password_hash }).eq('email', decoded.email);
  if (error) {
    console.error('[auth] Failed to update password:', error.message);
    return res.status(500).json({ error: 'Failed to update password' });
  }

  res.json({ success: true, message: 'Password has been updated' });
});

export default router;
