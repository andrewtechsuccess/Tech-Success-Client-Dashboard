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

export async function writeJson(file, data) {
  return withLock(file, async () => {
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, file);
    return data;
  });
}
