import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';
import { cacheGet, cacheSet } from '../utils/cache.js';

const SUPABASE_TOKEN_TTL_SECONDS = 60;
const tokenKey = (token) => `sbtok:${crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)}`;

export const authMiddleware = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });

  // 1. Our own session JWT (email/password login and /auth/google exchange) — verified locally, no I/O
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    // Reject special-purpose tokens (e.g. password reset) and malformed ones.
    if (decoded.purpose || !decoded.id) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = { id: decoded.id, email: decoded.email };
    return next();
  } catch {
    // not one of our tokens — fall through to the Supabase check
  }

  // 2. Supabase OAuth access token — mapped to a row in our users table.
  //    Costs two network round trips, so the result is cached for a minute.
  try {
    const cached = await cacheGet(tokenKey(token));
    if (cached) {
      req.user = cached;
      return next();
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user?.email) throw new Error('Invalid Supabase token');

    const { data: customUser } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', user.email.toLowerCase())
      .maybeSingle();

    // No local account yet: the client must call /auth/google first.
    if (!customUser) return res.status(401).json({ error: 'Account not initialised' });

    req.user = { id: customUser.id, email: customUser.email };
    await cacheSet(tokenKey(token), req.user, SUPABASE_TOKEN_TTL_SECONDS);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
