// Server entry. Serves the API and (in production) the built React app.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { getConfig, ensureDirs, CLIENT_DIST } from './config.js';
import { authRouter, requireAuth } from './auth.js';
import clientsRouter from './routes/clients.js';
import catalogRouter from './routes/catalog.js';
import connectwiseRouter from './routes/connectwise.js';

ensureDirs();
getConfig(); // triggers first-run init + the default-password warning

const app = express();
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/clients', requireAuth, clientsRouter);
app.use('/api/catalog', requireAuth, catalogRouter);
app.use('/api/connectwise', requireAuth, connectwiseRouter);

// Serve the built SPA if it exists (production / standalone install).
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

// JSON error handler.
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (!res.headersSent) res.status(status).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 4100;
app.listen(PORT, () => {
  console.log(`\n  Tech Success — Client Dashboard  →  http://localhost:${PORT}\n`);
  if (!fs.existsSync(CLIENT_DIST)) {
    console.log('  UI not built yet. Run "npm run build" (prod) or "npm run dev" (live dev).\n');
  }
});
