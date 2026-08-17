// Tiny JSON flat-file store with per-file write serialization + atomic writes.
import fs from 'node:fs/promises';

const locks = new Map();

function withLock(file, fn) {
  const prev = locks.get(file) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  // Keep the chain alive but don't let rejections break future writes.
  locks.set(file, run.catch(() => {}));
  return run;
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

async function atomicWrite(file, data) {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file);
  return data;
}

export async function writeJson(file, data) {
  return withLock(file, () => atomicWrite(file, data));
}

// Read-modify-write with the file's lock held across BOTH halves. Two
// overlapping requests would otherwise each read the same snapshot and the
// second write would silently drop the first one's change — even when they
// touched completely different records.
//
// `fn` mutates the loaded data in place and returns whatever the caller wants
// back. Throwing from `fn` aborts the write, so a handler can reject a bad
// request (e.g. unknown id) without leaving a partial change on disk.
//
// Never call writeJson/mutateJson for the same file from inside `fn` — the
// lock is not re-entrant and it would deadlock.
export async function mutateJson(file, fallback, fn) {
  return withLock(file, async () => {
    const data = await readJson(file, fallback);
    const result = await fn(data);
    await atomicWrite(file, data);
    return result;
  });
}

// Cheap change token for polling: a stat, not a read of the whole file.
export async function fileVersion(file) {
  try {
    const s = await fs.stat(file);
    return `${s.mtimeMs}-${s.size}`;
  } catch (e) {
    if (e.code === 'ENOENT') return '0-0';
    throw e;
  }
}
