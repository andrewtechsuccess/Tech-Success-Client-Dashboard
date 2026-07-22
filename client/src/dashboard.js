// Shared constants + derived helpers for the client dashboard. Kept in one
// place so the board, projects view, editor and expanded view agree on labels,
// colours, and rules. Status values mirror server/catalog.js + server/routes/clients.js.

// Product rollout status. "not_needed" is hidden on the client card.
export const PRODUCT_STATUSES = [
  { value: 'not_started', label: 'Not started', cls: 'not_started' },
  { value: 'planning', label: 'Planning', cls: 'planning' },
  { value: 'in_progress', label: 'In progress', cls: 'in_progress' },
  { value: 'complete', label: 'Complete', cls: 'complete' },
  { value: 'not_needed', label: 'Not needed', cls: 'not_needed' }
];

// Project / issue pipeline status.
export const PROJECT_STATUSES = [
  { value: 'opportunity', label: 'Opportunity', cls: 'opportunity' },
  { value: 'sow', label: 'SOW', cls: 'sow' },
  { value: 'approved', label: 'Approved', cls: 'approved' },
  { value: 'in_progress', label: 'In progress', cls: 'in_progress' },
  { value: 'completed', label: 'Completed', cls: 'completed' }
];

export const PROJECT_TYPES = [
  { value: 'project', label: 'Project' },
  { value: 'issue', label: 'Issue' }
];

// Whether a project is part of the agreed scope or an extra. Defaults to
// in_scope for any project that predates this field.
export const PROJECT_SCOPES = [
  { value: 'in_scope', label: 'In Scope' },
  { value: 'extra', label: 'Extra' }
];
export const projectScope = (p) => (p?.scope === 'extra' ? 'extra' : 'in_scope');

export const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' }
];

// Current plan / agreement status for a client.
export const PLAN_STATUSES = ['New TPS', 'TSP', 'TSP Basic', 'Adhoc'];

// External per-client links rendered as buttons in the expanded view (each
// hidden when its URL is blank). Stored as their own client fields.
export const CLIENT_LINKS = [
  { key: 'docsLink', label: 'Sharepoint Doc' },
  { key: 'clientDashboardLink', label: 'Client Dashboard' },
  { key: 'oneNoteLink', label: 'OneNote' },
  { key: 'itBoostLink', label: 'IT Boost' }
];

// Implementation-backlog task status (per client, per product, per task).
// Values mirror server/backlog.js.
export const BACKLOG_STATUSES = [
  { value: 'not_completed', label: 'Not completed', cls: 'not_completed' },
  { value: 'scheduled', label: 'Scheduled', cls: 'scheduled' },
  { value: 'in_progress', label: 'In progress', cls: 'in_progress' },
  { value: 'completed', label: 'Completed', cls: 'completed' }
];

const labelMap = (arr) => Object.fromEntries(arr.map((o) => [o.value, o.label]));
export const BACKLOG_STATUS_LABEL = labelMap(BACKLOG_STATUSES);
export const PRODUCT_STATUS_LABEL = labelMap(PRODUCT_STATUSES);
export const PROJECT_STATUS_LABEL = labelMap(PROJECT_STATUSES);
export const PROJECT_SCOPE_LABEL = labelMap(PROJECT_SCOPES);
export const PRIORITY_LABEL = labelMap(PRIORITIES);

export const UNASSIGNED = 'Unassigned';

// Make a manually-entered link safe to open externally (prepend scheme if missing).
export const externalHref = (u) => {
  const s = (u || '').trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};

// Sentiment 1-5 → clamped value + colour (1-2 red, 3 amber, 4-5 green).
export function sentimentInfo(v) {
  const n = Math.min(5, Math.max(1, Math.round(Number(v) || 3)));
  const color = n <= 2 ? 'var(--danger)' : n === 3 ? 'var(--warn)' : 'var(--ok)';
  return { value: n, color };
}

// Derived health for a client card, from product rollout (ignoring "not needed").
export function clientHealth(client) {
  const products = (client.products || []).filter((p) => p.status !== 'not_needed');
  if (products.length && products.every((p) => p.status === 'complete')) return { level: 'green', label: 'All complete' };
  if (products.some((p) => p.status === 'in_progress' || p.status === 'planning')) return { level: 'amber', label: 'In progress' };
  return { level: 'neutral', label: 'Not started' };
}

// Products visible on the card (everything except "not needed").
export const visibleProducts = (client) => (client.products || []).filter((p) => p.status !== 'not_needed');

// Roll-up product counts across a list of clients for the summary strip.
export function summarize(clients) {
  let planning = 0, inProgress = 0, complete = 0;
  for (const c of clients) {
    for (const p of c.products || []) {
      if (p.status === 'planning') planning++;
      else if (p.status === 'in_progress') inProgress++;
      else if (p.status === 'complete') complete++;
    }
  }
  return { clients: clients.length, planning, inProgress, complete };
}

// A client's saved state for one backlog task, with defaults for tasks the
// client has never touched (templates merge in at render time, so new template
// tasks appear on every client automatically).
export function clientBacklogTask(client, productName, task) {
  const st = client?.backlog?.[productName]?.[task.id];
  return {
    status: BACKLOG_STATUS_LABEL[st?.status] ? st.status : 'not_completed',
    engineer: st?.engineer || '',
    due: st?.due || ''
  };
}

// Backlog progress for one client across all template products, skipping
// products this client has marked "not needed".
export function backlogProgress(client, templates, catalogOrder) {
  let done = 0;
  let total = 0;
  for (const name of catalogOrder) {
    const tasks = templates[name] || [];
    if (!tasks.length) continue;
    const prod = (client.products || []).find((p) => p.template && p.name === name);
    if (prod && prod.status === 'not_needed') continue;
    for (const t of tasks) {
      total++;
      if (clientBacklogTask(client, name, t).status === 'completed') done++;
    }
  }
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

// Parse a stored due string into a Date at local midnight. Due dates are
// YYYY-MM-DD from the date inputs, but older project rows may hold free text —
// fall back to Date parsing and return null for anything unparseable.
export function parseDue(s) {
  const t = (s || '').trim();
  if (!t) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(`${t}T00:00:00`) : new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Roadmap items for a client: every dated, not-yet-completed backlog task and
// project/issue, sorted soonest first, plus counts of open items with no date.
export function clientRoadmap(client, templates, catalogOrder) {
  const items = [];
  let undatedTasks = 0;
  let undatedProjects = 0;
  for (const name of catalogOrder) {
    const tasks = templates[name] || [];
    if (!tasks.length) continue;
    const prod = (client.products || []).find((p) => p.template && p.name === name);
    if (prod && prod.status === 'not_needed') continue;
    for (const t of tasks) {
      const st = clientBacklogTask(client, name, t);
      if (st.status === 'completed') continue;
      const date = parseDue(st.due);
      if (!date) {
        undatedTasks++;
        continue;
      }
      items.push({ kind: 'task', date, title: t.title, product: name, status: st.status, who: st.engineer });
    }
  }
  for (const p of client.projects || []) {
    if (p.status === 'completed') continue;
    const date = parseDue(p.due);
    if (!date) {
      undatedProjects++;
      continue;
    }
    items.push({
      kind: p.type === 'issue' ? 'issue' : 'project',
      date,
      title: p.title,
      status: p.status,
      who: p.owner,
      priority: p.priority
    });
  }
  items.sort((a, b) => a.date - b.date);
  return { items, undatedTasks, undatedProjects };
}

// Distinct account-manager names across clients (for the editor's datalist and grouping).
export function accountManagers(clients) {
  const set = new Set();
  for (const c of clients) {
    const am = (c.accountManager || '').trim();
    if (am) set.add(am);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Distinct project owners across all clients' projects (for the people filter).
export function projectOwners(clients) {
  const set = new Set();
  for (const c of clients) {
    for (const p of c.projects || []) {
      const o = (p.owner || '').trim();
      if (o) set.add(o);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Existing staff list = everyone already known in the system (account managers
// + anyone already assigned as a project manager). Populates the Project
// Manager dropdown on projects.
export function staffList(clients) {
  const set = new Set();
  for (const c of clients) {
    const am = (c.accountManager || '').trim();
    if (am) set.add(am);
    for (const p of c.projects || []) {
      const o = (p.owner || '').trim();
      if (o) set.add(o);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
