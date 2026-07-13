// Authentication. Two modes, usable side-by-side during rollout:
//   1. Microsoft Entra ID (Microsoft 365 SSO) — the primary mode once the
//      ENTRA_* env vars are configured. The frontend obtains an access token
//      (via Teams SSO or MSAL) and sends it as a Bearer token; we validate it
//      against the tenant here.
//   2. Legacy single-password login -> short-lived JWT. Kept as a break-glass
//      fallback (and for local dev) so the app never locks everyone out.
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getConfig } from './config.js';
import { entraEnabled, entraPublicConfig, verifyEntraToken, userFromClaims } from './entra.js';

export const authRouter = express.Router();

// Optional kill-switch: set DISABLE_PASSWORD_LOGIN=1 once Entra is live to turn
// off the shared-password path entirely.
const passwordLoginEnabled = () => process.env.DISABLE_PASSWORD_LOGIN !== '1';

// Simple in-memory brute-force guard for the password login: after
// MAX_FAILURES failed attempts from one IP, block that IP for WINDOW_MS.
// (Entra logins never hit this path — Microsoft handles their throttling.)
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map(); // ip -> { count, firstAt }

function loginBlocked(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() - f.firstAt > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return f.count >= MAX_FAILURES;
}

function recordFailure(ip) {
  const now = Date.now();
  const f = failures.get(ip);
  if (!f || now - f.firstAt > WINDOW_MS) failures.set(ip, { count: 1, firstAt: now });
  else f.count++;
}

authRouter.post('/login', (req, res) => {
  if (!passwordLoginEnabled()) {
    return res.status(403).json({ error: 'Password login is disabled — sign in with Microsoft 365.' });
  }
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (loginBlocked(ip)) {
    return res.status(429).json({ error: 'Too many failed attempts — try again in 15 minutes.' });
  }
  const { password } = req.body || {};
  const config = getConfig();
  if (typeof password !== 'string' || !bcrypt.compareSync(password, config.passwordHash)) {
    recordFailure(ip);
    return res.status(401).json({ error: 'Invalid password' });
  }
  failures.delete(ip);
  const token = jwt.sign({ sub: 'admin' }, config.jwtSecret, { expiresIn: '8h' });
  res.json({ token, mustChangePassword: !!config._defaultPassword });
});

// Tells the frontend which sign-in methods are available so it can show the
// right UI (Microsoft button, password box, or both). entraConfig carries the
// PUBLIC identifiers (tenant/client id) the SPA needs to run MSAL/Teams SSO —
// these are not secrets, so exposing them unauthenticated is fine.
authRouter.get('/config', (req, res) => {
  res.json({ entra: entraEnabled(), passwordLogin: passwordLoginEnabled(), entraConfig: entraPublicConfig() });
});

// Returns the current signed-in user (after requireAuth populates req.user).
authRouter.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

function extractToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : req.query.token || '';
}

// Accepts either a legacy password JWT or an Entra access token. Populates
// req.user. Used as middleware on the protected API routers.
export async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  // 1. Legacy password JWT (HS256, signed with our local secret).
  try {
    const decoded = jwt.verify(token, getConfig().jwtSecret);
    req.user = { id: decoded.sub, name: 'Local admin', email: '', via: 'password' };
    return next();
  } catch {
    /* not a local token — try Entra below */
  }

  // 2. Entra ID access token (RS256, signed by Microsoft).
  if (entraEnabled()) {
    try {
      req.user = userFromClaims(await verifyEntraToken(token));
      return next();
    } catch {
      /* fall through to 401 */
    }
  }

  return res.status(401).json({ error: 'Session expired' });
}
