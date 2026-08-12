// One-time data migrations, run at boot. Every migration must be idempotent —
// it runs on every start and should be a no-op once the data is in shape.
import { readJson, writeJson } from './store.js';
import { CLIENTS_PATH } from './config.js';

// Projects used to carry a single `due` date. The Gantt view needs a span, so
// they now carry `start` + `end`, with the old due date becoming the end.
async function projectStartEndDates() {
  const clients = await readJson(CLIENTS_PATH, []);
  let touched = 0;
  for (const c of clients) {
    for (const p of c.projects || []) {
      let changed = false;
      if (p.end === undefined) {
        p.end = String(p.due ?? '').trim();
        changed = true;
      }
      if (p.start === undefined) {
        p.start = '';
        changed = true;
      }
      if ('due' in p) {
        delete p.due;
        changed = true;
      }
      if (changed) touched++;
    }
  }
  if (touched) {
    await writeJson(CLIENTS_PATH, clients);
    console.log(`  migrated ${touched} project(s) from "due" to start/end dates`);
  }
}

export async function runMigrations() {
  await projectStartEndDates();
}
