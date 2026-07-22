// Implementation backlog: every standard product carries a template task list
// describing the work needed to fully implement it. Templates are global (one
// list per product, keyed by product name — same name-matching convention the
// catalog uses); each client's per-task state (status / engineer / due date)
// lives on the client record as client.backlog[productName][taskId].
// Stored in data/backlog.json as { templates: { [product]: [{id,title}] }, engineers: [names] }.
import { randomUUID } from 'node:crypto';
import { readJson, writeJson } from './store.js';
import { BACKLOG_PATH } from './config.js';

export const BACKLOG_TASK_STATUSES = new Set(['not_completed', 'scheduled', 'in_progress', 'completed']);

const str = (v) => String(v ?? '').trim();

// Template map: product name → ordered task list. Tasks keep a stable id so
// per-client state survives renames of the task title.
export function normTemplates(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [product, tasks] of Object.entries(raw)) {
    const name = str(product);
    if (!name || !Array.isArray(tasks)) continue;
    const list = tasks
      .map((t) => ({ id: str(t?.id) || randomUUID(), title: str(t?.title) }))
      .filter((t) => t.title);
    if (list.length) out[name] = list;
  }
  return out;
}

// Engineer roster (assignment dropdown). Trimmed, de-duped, order preserved.
export function normEngineers(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const n of raw) {
    const s = str(n);
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
  }
  return out;
}

export async function readBacklog() {
  const b = await readJson(BACKLOG_PATH, {});
  return { templates: normTemplates(b?.templates), engineers: normEngineers(b?.engineers) };
}

export const writeBacklog = (b) => writeJson(BACKLOG_PATH, b);
