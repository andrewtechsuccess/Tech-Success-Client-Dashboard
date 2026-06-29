// Read/replace the standard product catalog. Replacing it re-applies the list
// to every client (preserving each client's existing statuses + custom products).
import express from 'express';
import { readCatalog, writeCatalog, reconcileAllClients } from '../catalog.js';

const router = express.Router();

router.get('/', async (req, res) => {
  res.json({ products: await readCatalog() });
});

router.put('/', async (req, res) => {
  const raw = req.body?.products;
  if (!Array.isArray(raw)) return res.status(400).json({ error: 'products must be an array of names' });
  const seen = new Set();
  const names = [];
  for (const n of raw) {
    const s = String(n ?? '').trim();
    if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); names.push(s); }
  }
  await writeCatalog(names);
  const clientsUpdated = await reconcileAllClients(names);
  res.json({ products: names, clientsUpdated });
});

export default router;
