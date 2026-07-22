// Read/update the implementation-backlog templates (per-product task lists)
// and the engineer roster. Per-client task state is updated via
// PUT /api/clients/:id/backlog (see routes/clients.js).
import express from 'express';
import { readBacklog, writeBacklog, normTemplates, normEngineers } from '../backlog.js';

const router = express.Router();

router.get('/', async (req, res) => {
  res.json(await readBacklog());
});

router.put('/templates', async (req, res) => {
  const raw = req.body?.templates;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return res.status(400).json({ error: 'templates must be an object map of product → tasks' });
  }
  const current = await readBacklog();
  const next = { ...current, templates: normTemplates(raw) };
  await writeBacklog(next);
  res.json(next);
});

router.put('/engineers', async (req, res) => {
  const raw = req.body?.engineers;
  if (!Array.isArray(raw)) return res.status(400).json({ error: 'engineers must be an array of names' });
  const current = await readBacklog();
  const next = { ...current, engineers: normEngineers(raw) };
  await writeBacklog(next);
  res.json(next);
});

export default router;
