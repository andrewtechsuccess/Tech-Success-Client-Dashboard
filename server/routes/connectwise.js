// ConnectWise integration endpoints. All behind requireAuth (mounted in index.js).
// Credentials are stored server-side in data/connectwise.json — the private key
// is never returned to the client.
import express from 'express';
import { publicView, writeCwConfig, testConnection, listBoards, createTicket } from '../connectwise.js';
import { readJson } from '../store.js';
import path from 'node:path';
import { DATA_DIR } from '../config.js';

const router = express.Router();
const CW_PATH = path.join(DATA_DIR, 'connectwise.json');

// Non-secret view of the current config (drives the Settings UI).
router.get('/config', async (req, res, next) => {
  try {
    const raw = (await readJson(CW_PATH, {})) || {};
    res.json(publicView(raw));
  } catch (e) {
    next(e);
  }
});

// Update credentials. Only writes the keys that are provided (so you can leave
// the private key untouched when editing other fields).
router.put('/config', async (req, res, next) => {
  try {
    res.json(await writeCwConfig(req.body || {}));
  } catch (e) {
    next(e);
  }
});

// Wrap ConnectWise API errors into a clean JSON response (surface the CW detail
// so integration issues are debuggable, but never leak our stored secrets).
const cw = (handler) => async (req, res) => {
  try {
    res.json(await handler(req));
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message, detail: e.body ?? null });
  }
};

router.get('/test', cw(() => testConnection()));
router.get('/boards', cw(() => listBoards()));

router.post('/tickets', async (req, res) => {
  try {
    const t = await createTicket(req.body || {});
    res.status(201).json({
      id: t.id,
      summary: t.summary,
      board: t.board?.name,
      status: t.status?.name,
      company: t.company?.identifier,
      url: t._info?.ticketHref || null
    });
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message, detail: e.body ?? null });
  }
});

export default router;
