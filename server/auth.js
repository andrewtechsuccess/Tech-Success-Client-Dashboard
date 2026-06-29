// Single-password login -> JWT (8h). No multi-user.
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getConfig } from './config.js';

export const authRouter = express.Router();

authRouter.post('/login', (req, res) => {
  const { password } = req.body || {};
  const config = getConfig();
  if (typeof password !== 'string' || !bcrypt.compareSync(password, config.passwordHash)) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = jwt.sign({ sub: 'admin' }, config.jwtSecret, { expiresIn: '8h' });
  res.json({ token, mustChangePassword: !!config._defaultPassword });
});

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  // Allow ?token= for stream endpoints that can't set headers (defensive; the
  // client uses fetch + Authorization header, but this keeps EventSource viable).
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token || '';
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    jwt.verify(token, getConfig().jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired' });
  }
}
