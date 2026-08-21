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

// Parse a stored date string into a Date at local midnight. Dates are
// YYYY-MM-DD from the date inputs, but older project rows may hold free text —
// fall back to Date parsing and return null for anything unparseable.
export function parseDue(s) {
  const t = (s || '').trim();
  if (!t) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(`${t}T00:00:00`) : new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const DAY_MS = 86400000;

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export const today = () => startOfDay(new Date());
export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
// Whole days from a to b. Built on local midnights so DST shifts can't make a
// day come out as 0.96 and round the wrong way.
export const diffDays = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);

// A target quarter, for work that's expected in a rough window rather than on
// known dates. Stored as "2026-Q4"; shown as "Q4-26".
export const QUARTER_RE = /^(\d{4})-Q([1-4])$/;

export const quarterLabel = (q) => {
  const m = QUARTER_RE.exec(q || '');
  return m ? `Q${m[2]}-${m[1].slice(2)}` : '';
};

// The calendar span of a quarter: first day of its first month to the last day
// of its third.
export function quarterRange(q) {
  const m = QUARTER_RE.exec(q || '');
  if (!m) return null;
  const year = Number(m[1]);
  const firstMonth = (Number(m[2]) - 1) * 3;
  return { from: new Date(year, firstMonth, 1), to: new Date(year, firstMonth + 3, 0) };
}

export const quarterOf = (d) => `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;

// The current quarter plus the next `count` — what you can plan into.
export function futureQuarters(count = 8, from = new Date()) {
  const out = [];
  let year = from.getFullYear();
  let q = Math.floor(from.getMonth() / 3) + 1;
  for (let i = 0; i <= count; i++) {
    out.push({ value: `${year}-Q${q}`, label: `Q${q}-${String(year).slice(2)}` });
    if (++q > 4) {
      q = 1;
      year++;
    }
  }
  return out;
}

// A project's span on the timeline, or null if there's nothing to place it by.
// Real dates win; a target quarter is the fallback and marks the span tentative
// so the chart can draw it as a rough intention rather than a commitment. One
// date alone gives a single-day marker, as does an end that lands before the
// start.
export function projectSpan(p) {
  const s = parseDue(p?.start);
  const e = parseDue(p?.end);
  if (!s && !e) {
    const q = quarterRange(p?.quarter);
    if (!q) return null;
    return { from: q.from, to: q.to, days: diffDays(q.from, q.to) + 1, tentative: true };
  }
  const from = s || e;
  const to = e && e >= from ? e : from;
  return { from, to, days: diffDays(from, to) + 1, tentative: false };
}

// Open and already past its end date.
export const isOverdue = (p) => {
  if (p?.status === 'completed') return false;
  const e = parseDue(p?.end);
  return !!e && e < today();
};

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
    const date = parseDue(p.end);
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

// Estimated effort on a project, in hours. 0 means nobody has estimated it —
// the roll-ups count those separately rather than treating them as free work.
export const projectHours = (p) => {
  const n = Number(p?.hours);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Hours read better as "12h" / "1.5h" than as raw numbers.
export const fmtHours = (n) => (n ? `${Number(n.toFixed(2))}h` : '—');

// Workload per project manager, from the projects they own. Completed work is
// excluded — this answers "who is carrying what right now", so a PM shouldn't
// look loaded because of everything they finished last quarter.
export function pmWorkload(clients) {
  const m = new Map();
  const get = (name) => {
    if (!m.has(name)) {
      m.set(name, {
        pm: name,
        openProjects: 0,
        hours: 0,
        activeHours: 0,
        unestimated: 0,
        overdue: 0,
        clients: new Set()
      });
    }
    return m.get(name);
  };

  for (const c of clients) {
    for (const p of c.projects || []) {
      if (p.status === 'completed') continue;
      const w = get((p.owner || '').trim() || UNASSIGNED);
      const h = projectHours(p);
      w.openProjects++;
      w.hours += h;
      if (p.status === 'approved' || p.status === 'in_progress') w.activeHours += h;
      if (!h) w.unestimated++;
      if (isOverdue(p)) w.overdue++;
      w.clients.add(c.id);
    }
  }

  return [...m.values()]
    .map((w) => ({ ...w, clients: w.clients.size }))
    .sort((a, b) => {
      if (a.pm === UNASSIGNED) return 1;
      if (b.pm === UNASSIGNED) return -1;
      return b.hours - a.hours || b.openProjects - a.openProjects || a.pm.localeCompare(b.pm);
    });
}

// Open estimated hours across a set of clients, for a board column header.
export function openHours(clients) {
  let hours = 0;
  let unestimated = 0;
  for (const c of clients) {
    for (const p of c.projects || []) {
      if (p.status === 'completed') continue;
      const h = projectHours(p);
      hours += h;
      if (!h) unestimated++;
    }
  }
  return { hours, unestimated };
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
