// CRUD for clients (data/clients.json). Client `id` is derived from the code at
// creation and is immutable thereafter.
import express from 'express';
import { randomUUID } from 'node:crypto';
import { readJson, writeJson, mutateJson, fileVersion } from '../store.js';
import { CLIENTS_PATH } from '../config.js';
import { slugify } from '../util.js';
import { PRODUCT_STATUSES, readCatalog, applyCatalogToClient } from '../catalog.js';
import { BACKLOG_TASK_STATUSES } from '../backlog.js';

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

// Estimated effort in hours. Blank/invalid means "not estimated yet", which
// is stored as 0 so the field is always a number for the roll-ups.
const normHours = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100000, Math.round(n * 100) / 100);
};

// Target quarter for work that's planned to a rough window rather than exact
// dates, stored as "2026-Q4". Anything else becomes blank so a bad value can't
// place a bar at a nonsense point on the timeline.
const normQuarter = (v) => (/^\d{4}-Q[1-4]$/.test(str(v)) ? str(v) : '');

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

// Checklist tasks on a project (Planner-style). Blank rows are dropped.
function normTasks(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((t) => ({
      id: t?.id || randomUUID(),
      text: str(t?.text),
      done: !!t?.done,
      createdAt: t?.createdAt || new Date().toISOString()
    }))
    .filter((t) => t.text);
}

// Normalize a projects/issues array (Planner-style work items). `start`/`end`
// are the scheduled span (both optional) that the Gantt view draws; `end`
// replaced the older single `due` field, so a payload that still carries `due`
// is accepted and folded into `end`.
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
      hours: normHours(p?.hours),
      quarter: normQuarter(p?.quarter),
      start: str(p?.start),
      end: str(p?.end !== undefined ? p.end : p?.due),
      connectwiseLink: normUrl(p?.connectwiseLink),
      notes: str(p?.notes),
      tasks: normTasks(p?.tasks)
    }))
    .filter((p) => p.title);
}

// ---------------------------------------------------------------------------
// Field-level editing.
//
// The whole-record PUT below rewrites a client's entire products/projects
// arrays from whatever snapshot the browser happened to be holding, so a tab
// that has been open for an hour silently reverts everyone else's work. These
// routes patch one entity — or one field — at a time, under the store lock, so
// concurrent edits only collide when they touch the same field.
// ---------------------------------------------------------------------------

const httpError = (status, message) => Object.assign(new Error(message), { status });

function pick(list, id, what) {
  const found = (list || []).find((x) => x.id === id);
  if (!found) throw httpError(404, `${what} not found`);
  return found;
}
const pickClient = (clients, id) => pick(clients, id, 'Client');

// Per-field normalizers, so a patch validates exactly the keys it was sent and
// leaves every other field untouched.
const CLIENT_FIELDS = {
  name: str,
  code: str,
  notes: (v) => String(v ?? ''),
  color: str,
  accountManager: str,
  planStatus: (v) => (PLAN_STATUSES.has(str(v)) ? str(v) : ''),
  docsLink: normUrl,
  clientDashboardLink: normUrl,
  oneNoteLink: normUrl,
  itBoostLink: normUrl,
  sentiment: normSentiment
};
const PROJECT_FIELDS = {
  title: str,
  type: (v) => (PROJECT_TYPES.has(v) ? v : 'project'),
  scope: (v) => (PROJECT_SCOPES.has(v) ? v : 'in_scope'),
  status: (v) => (PROJECT_STATUSES.has(v) ? v : 'opportunity'),
  priority: (v) => (PRIORITIES.has(v) ? v : 'medium'),
  owner: str,
  hours: normHours,
  quarter: normQuarter,
  start: str,
  end: str,
  connectwiseLink: normUrl,
  notes: str
};
const PRODUCT_FIELDS = {
  name: str,
  status: (v) => (PRODUCT_STATUSES.has(v) ? v : 'not_started'),
  note: str
};
const TASK_FIELDS = { text: str, done: (v) => !!v };

// Copy the patch's known keys onto the target. Keys the caller didn't send are
// left alone — that's the whole point.
function applyPatch(target, patch, fields, required = []) {
  for (const key of required) {
    if (patch?.[key] !== undefined && !str(patch[key])) throw httpError(400, `${key} cannot be empty`);
  }
  for (const [key, norm] of Object.entries(fields)) {
    if (patch?.[key] !== undefined) target[key] = norm(patch[key]);
  }
  return target;
}

router.get('/', async (req, res) => {
  res.json(await getClients());
});

// Cheap change token for background polling — a stat, not a full read, so ten
// browsers checking every 20s cost nothing.
router.get('/version', async (req, res) => {
  res.json({ version: await fileVersion(CLIENTS_PATH) });
});

// Patch a client's own fields (not its products/projects).
router.patch('/:id', async (req, res, next) => {
  try {
    const client = await mutateJson(CLIENTS_PATH, [], (clients) =>
      applyPatch(pickClient(clients, req.params.id), req.body || {}, CLIENT_FIELDS, ['name'])
    );
    res.json(client);
  } catch (e) {
    next(e);
  }
});

// --- Projects --------------------------------------------------------------

router.post('/:id/projects', async (req, res, next) => {
  try {
    const result = await mutateJson(CLIENTS_PATH, [], (clients) => {
      const client = pickClient(clients, req.params.id);
      if (!str(req.body?.title)) throw httpError(400, 'title is required');
      const [project] = normProjects([{ ...req.body, id: undefined }]);
      if (!Array.isArray(client.projects)) client.projects = [];
      client.projects.push(project);
      return { client, project };
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/projects/:projectId', async (req, res, next) => {
  try {
    const client = await mutateJson(CLIENTS_PATH, [], (clients) => {
      const c = pickClient(clients, req.params.id);
      const project = pick(c.projects, req.params.projectId, 'Project');
      applyPatch(project, req.body || {}, PROJECT_FIELDS, ['title']);
      return c;
    });
    res.json(client);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id/projects/:projectId', async (req, res, next) => {
  try {
    const client = await mutateJson(CLIENTS_PATH, [], (clients) => {
      const c = pickClient(clients, req.params.id);
      const idx = (c.projects || []).findIndex((p) => p.id === req.params.projectId);
      if (idx < 0) throw httpError(404, 'Project not found');
      c.projects.splice(idx, 1);
      return c;
    });
    res.json(client);
  } catch (e) {
    next(e);
  }
});

// --- Project tasks ---------------------------------------------------------

router.post('/:id/projects/:projectId/tasks', async (req, res, next) => {
  try {
    const client = await mutateJson(CLIENTS_PATH, [], (clients) => {
      const c = pickClient(clients, req.params.id);
      const project = pick(c.projects, req.params.projectId, 'Project');
      const text = str(req.body?.text);
      if (!text) throw httpError(400, 'text is required');
      if (!Array.isArray(project.tasks)) project.tasks = [];
      project.tasks.push({ id: randomUUID(), text, done: !!req.body?.done, createdAt: new Date().toISOString() });
      return c;
    });
    res.status(201).json(client);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/projects/:projectId/tasks/:taskId', async (req, res, next) => {
  try {
    const client = await mutateJson(CLIENTS_PATH, [], (clients) => {
      const c = pickClient(clients, req.params.id);
      const project = pick(c.projects, req.params.projectId, 'Project');
      const task = pick(project.tasks, req.params.taskId, 'Task');
      applyPatch(task, req.body || {}, TASK_FIELDS, ['text']);
      return c;
    });
    res.json(client);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id/projects/:projectId/tasks/:taskId', async (req, res, next) => {
  try {
    const client = await mutateJson(CLIENTS_PATH, [], (clients) => {
      const c = pickClient(clients, req.params.id);
      const project = pick(c.projects, req.params.projectId, 'Project');
      const idx = (project.tasks || []).findIndex((t) => t.id === req.params.taskId);
      if (idx < 0) throw httpError(404, 'Task not found');
      project.tasks.splice(idx, 1);
      return c;
    });
    res.json(client);
  } catch (e) {
    next(e);
  }
});

// --- Products --------------------------------------------------------------

router.post('/:id/products', async (req, res, next) => {
  try {
    const result = await mutateJson(CLIENTS_PATH, [], (clients) => {
      const client = pickClient(clients, req.params.id);
      if (!str(req.body?.name)) throw httpError(400, 'name is required');
      // Custom products only — template rows come from the catalog.
      const [product] = normProducts([{ ...req.body, id: undefined, template: false }]);
      if (!Array.isArray(client.products)) client.products = [];
      client.products.push(product);
      return { client, product };
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/products/:productId', async (req, res, next) => {
  try {
    const client = await mutateJson(CLIENTS_PATH, [], (clients) => {
      const c = pickClient(clients, req.params.id);
      const product = pick(c.products, req.params.productId, 'Product');
      // A template product's name is owned by the catalog.
      const patch = product.template ? { ...req.body, name: undefined } : req.body;
      applyPatch(product, patch || {}, PRODUCT_FIELDS, ['name']);
      return c;
    });
    res.json(client);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id/products/:productId', async (req, res, next) => {
  try {
    const client = await mutateJson(CLIENTS_PATH, [], (clients) => {
      const c = pickClient(clients, req.params.id);
      const product = pick(c.products, req.params.productId, 'Product');
      if (product.template) throw httpError(400, 'Standard products are removed from the catalog in Settings');
      c.products = c.products.filter((p) => p.id !== req.params.productId);
      return c;
    });
    res.json(client);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res) => {
  const {
    name, code, notes = '', color = '#3b82f6', accountManager = '', planStatus = '', docsLink = '',
    clientDashboardLink = '', oneNoteLink = '', itBoostLink = ''
  } = req.body || {};
  if (!name || !code) return res.status(400).json({ error: 'name and code are required' });

  const catalog = await readCatalog();
  const client = await mutateJson(CLIENTS_PATH, [], (clients) => {
    // Pick the id inside the lock, or two people adding clients at once can
    // both land on the same slug.
    const existing = new Set(clients.map((c) => c.id));
    let id = slugify(code);
    const base = id;
    let n = 2;
    while (existing.has(id)) id = `${base}-${n++}`;

    const created = {
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
    applyCatalogToClient(created, catalog);
    clients.push(created);
    return created;
  });
  res.status(201).json(client);
});

// LEGACY whole-record replace. Superseded by the PATCH routes above — it
// rewrites products/projects wholesale from the caller's snapshot, so it can
// revert another user's concurrent edits. Kept only so browser tabs still
// running the previous build keep working until they reload; remove once
// everyone is past this deploy.
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

// Merge-patch one implementation-backlog task's per-client state. Body:
// { product, taskId, status?, engineer?, due? }. State is keyed by the template
// task id so template retitles don't lose progress; unknown statuses coerce to
// the default so a bad payload can't poison the page.
router.put('/:id/backlog', async (req, res, next) => {
  const product = str(req.body?.product);
  const taskId = str(req.body?.taskId);
  if (!product || !taskId) return res.status(400).json({ error: 'product and taskId are required' });

  try {
    const client = await mutateJson(CLIENTS_PATH, [], (clients) => {
      const c = pickClient(clients, req.params.id);
      if (!c.backlog || typeof c.backlog !== 'object' || Array.isArray(c.backlog)) c.backlog = {};
      if (!c.backlog[product] || typeof c.backlog[product] !== 'object') c.backlog[product] = {};
      const cur = c.backlog[product][taskId] || { status: 'not_completed', engineer: '', due: '' };
      if (req.body.status !== undefined) cur.status = BACKLOG_TASK_STATUSES.has(req.body.status) ? req.body.status : 'not_completed';
      if (req.body.engineer !== undefined) cur.engineer = str(req.body.engineer);
      if (req.body.due !== undefined) cur.due = str(req.body.due);
      c.backlog[product][taskId] = cur;
      return c;
    });
    res.json(client);
  } catch (e) {
    next(e);
  }
});

// Append a timestamped note to the client's note log (used by the expanded view).
router.post('/:id/notes', async (req, res, next) => {
  const text = str(req.body?.text);
  if (!text) return res.status(400).json({ error: 'note text is required' });
  try {
    const client = await mutateJson(CLIENTS_PATH, [], (clients) => {
      const c = pickClient(clients, req.params.id);
      if (!Array.isArray(c.noteLog)) c.noteLog = [];
      c.noteLog.push({ id: randomUUID(), text, createdAt: new Date().toISOString() });
      return c;
    });
    res.status(201).json(client);
  } catch (e) {
    next(e);
  }
});

// Delete a single note from the client's note log.
router.delete('/:id/notes/:noteId', async (req, res, next) => {
  try {
    const client = await mutateJson(CLIENTS_PATH, [], (clients) => {
      const c = pickClient(clients, req.params.id);
      const log = Array.isArray(c.noteLog) ? c.noteLog : [];
      const idx = log.findIndex((n) => n.id === req.params.noteId);
      if (idx < 0) throw httpError(404, 'Note not found');
      log.splice(idx, 1);
      c.noteLog = log;
      return c;
    });
    res.json(client);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  let removed;
  try {
    await mutateJson(CLIENTS_PATH, [], (clients) => {
      const idx = clients.findIndex((c) => c.id === req.params.id);
      if (idx < 0) throw httpError(404, 'Client not found');
      [removed] = clients.splice(idx, 1);
    });
  } catch (e) {
    return next(e);
  }
  // Intentionally keep scripts/<id>/ on disk so deleting a client never
  // silently destroys its script library.
  res.json({ ok: true, removed, note: 'Script folder retained on disk' });
});

export default router;
