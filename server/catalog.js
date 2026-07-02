// The product catalog: a standard list of product names shown on EVERY client
// as locked "template" products, each tracked per-client through a rollout
// status. Stored in data/catalog.json as { products: ["Name", ...] }.
import { randomUUID } from 'node:crypto';
import { readJson, writeJson } from './store.js';
import { CATALOG_PATH, CLIENTS_PATH } from './config.js';

// Rollout status for a product on a given client. "not_needed" products are
// hidden on the client card (but still editable).
export const PRODUCT_STATUSES = new Set(['not_started', 'planning', 'in_progress', 'complete', 'not_needed']);

export async function readCatalog() {
  const c = await readJson(CATALOG_PATH, { products: [] });
  return Array.isArray(c) ? c : Array.isArray(c.products) ? c.products : [];
}

export const writeCatalog = (names) => writeJson(CATALOG_PATH, { products: names });

// Ensure a client carries one locked template product per catalog entry,
// preserving any status the client already set, and keeping custom products
// (template === false) untouched. Mutates and returns the client.
export function applyCatalogToClient(client, catalog) {
  const existing = Array.isArray(client.products) ? client.products : [];
  const prevByName = new Map(existing.filter((p) => p.template).map((p) => [p.name, p]));
  const templates = catalog.map((name) => {
    const prev = prevByName.get(name);
    return {
      id: prev?.id || randomUUID(),
      name,
      status: prev && PRODUCT_STATUSES.has(prev.status) ? prev.status : 'not_started',
      template: true,
      note: prev?.note || ''
    };
  });
  const customs = existing.filter((p) => !p.template);
  client.products = [...templates, ...customs];
  return client;
}

// Re-apply the catalog to every client (after the list changes).
export async function reconcileAllClients(catalog) {
  const clients = await readJson(CLIENTS_PATH, []);
  for (const c of clients) applyCatalogToClient(c, catalog);
  await writeJson(CLIENTS_PATH, clients);
  return clients.length;
}
