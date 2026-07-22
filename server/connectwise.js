// ConnectWise Manage REST API client.
//
// Credentials live in data/connectwise.json (the data/ folder is gitignored,
// like config.json) so API keys never enter version control:
//   { "site": "api-au.myconnectwise.net", "companyId": "techsuccess",
//     "publicKey": "…", "privateKey": "…", "clientId": "…" }
//
// Auth is HTTP Basic with "companyId+publicKey:privateKey", plus the required
// clientId header on every request.
import path from 'node:path';
import { readJson, writeJson } from './store.js';
import { DATA_DIR } from './config.js';

const CW_PATH = path.join(DATA_DIR, 'connectwise.json');
const REQUIRED = ['site', 'companyId', 'publicKey', 'privateKey', 'clientId'];

export async function readCwConfig() {
  const c = await readJson(CW_PATH, null);
  if (!c) return null;
  return REQUIRED.every((k) => String(c[k] || '').trim()) ? c : null;
}

// Persist config. Returns a redacted view (never echoes the private key back).
export async function writeCwConfig(patch) {
  const current = (await readJson(CW_PATH, {})) || {};
  const next = { ...current };
  for (const k of REQUIRED) if (patch[k] !== undefined) next[k] = String(patch[k] ?? '').trim();
  await writeJson(CW_PATH, next);
  return publicView(next);
}

// Safe-to-return description of the config (no secrets).
export function publicView(c) {
  return {
    configured: REQUIRED.every((k) => String(c?.[k] || '').trim()),
    site: c?.site || '',
    companyId: c?.companyId || '',
    clientId: c?.clientId || '',
    hasPublicKey: !!c?.publicKey,
    hasPrivateKey: !!c?.privateKey
  };
}

export const cwConfigured = async () => !!(await readCwConfig());

// Normalize "api-au.myconnectwise.net" or a full URL into the API base.
function baseUrl(site) {
  const host = String(site).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return `https://${host}/v4_6_release/apis/3.0`;
}

function authHeaders(cfg) {
  const token = Buffer.from(`${cfg.companyId}+${cfg.publicKey}:${cfg.privateKey}`).toString('base64');
  return {
    Authorization: `Basic ${token}`,
    clientId: cfg.clientId,
    'Content-Type': 'application/json',
    Accept: 'application/vnd.connectwise.com+json; version=2021.1'
  };
}

async function cwFetch(cfg, apiPath, options = {}) {
  const res = await fetch(`${baseUrl(cfg.site)}${apiPath}`, {
    ...options,
    headers: { ...authHeaders(cfg), ...(options.headers || {}) }
  });
  const raw = await res.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }
  if (!res.ok) {
    const message = (body && (body.message || body.code)) || `ConnectWise API error ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

// Connectivity + auth check. /system/info needs a valid key pair + clientId.
export async function testConnection() {
  const cfg = await readCwConfig();
  if (!cfg) throw new Error('ConnectWise is not configured');
  const info = await cwFetch(cfg, '/system/info');
  return { ok: true, version: info?.version, cloudRegion: info?.cloudRegion };
}

// Service boards — used to pick a board when creating tickets.
export async function listBoards() {
  const cfg = await readCwConfig();
  if (!cfg) throw new Error('ConnectWise is not configured');
  return cwFetch(cfg, '/service/boards?fields=id,name&pageSize=1000&orderBy=name&conditions=inactiveFlag=false');
}

// Create a service ticket. `summary` is required; ConnectWise also needs a
// board and company (either may come from a default configured server-side).
export async function createTicket(input = {}) {
  const cfg = await readCwConfig();
  if (!cfg) throw new Error('ConnectWise is not configured');
  const summary = String(input.summary || '').trim();
  if (!summary) throw new Error('summary is required');

  const board = input.board ?? cfg.defaultBoard;
  const company = input.company ?? cfg.defaultCompany;
  const payload = { summary: summary.slice(0, 100) };
  if (board) payload.board = typeof board === 'number' ? { id: board } : { name: String(board) };
  if (company) payload.company = typeof company === 'number' ? { id: company } : { identifier: String(company) };
  if (input.initialDescription) payload.initialDescription = String(input.initialDescription);
  if (input.priority) payload.priority = typeof input.priority === 'number' ? { id: input.priority } : { name: String(input.priority) };
  if (input.contactName) payload.contactName = String(input.contactName);
  if (input.contactEmailAddress) payload.contactEmailAddress = String(input.contactEmailAddress);

  return cwFetch(cfg, '/service/tickets', { method: 'POST', body: JSON.stringify(payload) });
}
