// CRUD for clients (data/clients.json). Client `id` is derived from the code at
// creation and is immutable thereafter.
import express from 'express';
import { randomUUID } from 'node:crypto';
import { readJson, writeJson } from '../store.js';
import { CLIENTS_PATH } from '../config.js';
import { slugify } from '../util.js';
import { PRODUCT_STATUSES, readCatalog, applyCatalogToClient } from '../catalog.js';

const router = express.Router();

const getClients = () => readJson(CLIENTS_PATH, []);

// Allowed values for the dashboard fields. Unknown values are coerced to the
// first/default so a bad client payload can never poison the board.
const PROJECT_STATUSES = new Set(['opportunity', 'sow', 'approved', 'in_progress', 'completed']);
const PROJECT_TYPES = new Set(['project', 'issue']);
const PROJECT_SCOPES = new Set(['in_scope', 'extra']);
const PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const PLAN_STATUSES = new Set(['New TPS', 'TSP', 'TSP Basic', 'Adhoc']);

const str = (v) => String(v ?? '').trim();

// Normalize a manually-entered URL: keep blank as blank, otherwise ensure it
// has a scheme so it opens as an external link (not a relative app path).
const normUrl = (v) => {
  const s = str(v);
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};

// Client sentiment is a 1-5 rating (3 = neutral default).
const normSentiment = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 3;
};

// Append-only timestamped note log shown in the expanded client view.
const normNoteLog = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((nt) => ({
      id: nt?.id || randomUUID(),
      text: str(nt?.text),
      createdAt: nt?.createdAt || new Date().toISOString()
    }))
    .filter((nt) => nt.text);
};

// Normalize a products array: give every item an id, trim names, validate the
// status, preserve the `template` lock flag, and drop blank rows. The front-end
// sends the whole array on save.
function normProducts(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((p) => ({
      id: p?.id || randomUUID(),
      name: str(p?.name),
      status: PRODUCT_STATUSES.has(p?.status) ? p.status : 'not_started',
      template: !!p?.template,
      note: str(p?.note)
    }))
    .filter((p) => p.name);
}

// Normalize a projects/issues array (Planner-style work items).
function normProjects(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((p) => ({
      id: p?.id || randomUUID(),
      title: str(p?.title),
      type: PROJECT_TYPES.has(p?.type) ? p.type : 'project',
      scope: PROJECT_SCOPES.has(p?.scope) ? p.scope : 'in_scope',
      status: PROJECT_STATUSES.has(p?.status) ? p.status : 'opportunity',
      priority: PRIORITIES.has(p?.priority) ? p.priority : 'medium',
      owner: str(p?.owner),
      due: str(p?.due),
      connectwiseLink: normUrl(p?.connectwiseLink),
      notes: str(p?.notes)
    }))
    .filter((p) => p.title);
}

router.get('/', async (req, res) => {
  res.json(await getClients());
});

router.post('/', async (req, res) => {
  const {
    name, code, notes = '', color = '#3b82f6', accountManager = '', planStatus = '', docsLink = '',
    clientDashboardLink = '', oneNoteLink = '', itBoostLink = ''
  } = req.body || {};
  if (!name || !code) return res.status(400).json({ error: 'name and code are required' });

  const clients = await getClients();
  const existing = new Set(clients.map((c) => c.id));
  let id = slugify(code);
  const base = id;
  let n = 2;
  while (existing.has(id)) id = `${base}-${n++}`;

  const client = {
    id,
    name,
    code,
    notes,
    color,
    accountManager: str(accountManager),
    planStatus: PLAN_STATUSES.has(str(planStatus)) ? str(planStatus) : '',
    docsLink: normUrl(docsLink),
    clientDashboardLink: normUrl(clientDashboardLink),
    oneNoteLink: normUrl(oneNoteLink),
    itBoostLink: normUrl(itBoostLink),
    sentiment: normSentiment(req.body?.sentiment),
    products: normProducts(req.body?.products),
    projects: normProjects(req.body?.projects),
    noteLog: normNoteLog(req.body?.noteLog),
    createdAt: new Date().toISOString()
  };
  // Seed the standard catalog products (locked templates) onto the new client.
  applyCatalogToClient(client, await readCatalog());
  clients.push(client);
  await writeJson(CLIENTS_PATH, clients);
  res.status(201).json(client);
});

router.put('/:id', async (req, res) => {
  const clients = await getClients();
  const client = clients.find((c) => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const {
    name, code, notes, color, accountManager, planStatus, docsLink,
    clientDashboardLink, oneNoteLink, itBoostLink, sentiment, products, projects, noteLog
  } = req.body || {};
  if (name !== undefined) client.name = name;
  if (code !== undefined) client.code = code; // display only; id stays fixed
  if (notes !== undefined) client.notes = notes;
  if (color !== undefined) client.color = color;
  if (accountManager !== undefined) client.accountManager = str(accountManager);
  if (planStatus !== undefined) client.planStatus = PLAN_STATUSES.has(str(planStatus)) ? str(planStatus) : '';
  if (docsLink !== undefined) client.docsLink = normUrl(docsLink);
  if (clientDashboardLink !== undefined) client.clientDashboardLink = normUrl(clientDashboardLink);
  if (oneNoteLink !== undefined) client.oneNoteLink = normUrl(oneNoteLink);
  if (itBoostLink !== undefined) client.itBoostLink = normUrl(itBoostLink);
  if (sentiment !== undefined) client.sentiment = normSentiment(sentiment);
  if (products !== undefined) client.products = normProducts(products);
  if (projects !== undefined) client.projects = normProjects(projects);
  if (noteLog !== undefined) client.noteLog = normNoteLog(noteLog);
  await writeJson(CLIENTS_PATH, clients);
  res.json(client);
});

// Append a timestamped note to the client's note log (used by the expanded view).
router.post('/:id/notes', async (req, res) => {
  const text = str(req.body?.text);
  if (!text) return res.status(400).json({ error: 'note text is required' });
  const clients = await getClients();
  const client = clients.find((c) => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  if (!Array.isArray(client.noteLog)) client.noteLog = [];
  const note = { id: randomUUID(), text, createdAt: new Date().toISOString() };
  client.noteLog.push(note);
  await writeJson(CLIENTS_PATH, clients);
  res.status(201).json(client);
});

router.delete('/:id', async (req, res) => {
  const clients = await getClients();
  const idx = clients.findIndex((c) => c.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Client not found' });
  const [removed] = clients.splice(idx, 1);
  await writeJson(CLIENTS_PATH, clients);
  // Intentionally keep scripts/<id>/ on disk so deleting a client never
  // silently destroys its script library.
  res.json({ ok: true, removed, note: 'Script folder retained on disk' });
});

export default router;
