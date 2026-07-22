// Central configuration: paths + config.json (auth + settings) load/init/save.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
// On Azure App Service set DATA_DIR=/home/data so client data lives outside
// wwwroot and survives redeploys. Defaults to <repo>/data for local use.
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
export const CLIENT_DIST = path.join(ROOT, 'client', 'dist');

export const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
export const CLIENTS_PATH = path.join(DATA_DIR, 'clients.json');
export const CATALOG_PATH = path.join(DATA_DIR, 'catalog.json');
export const BACKLOG_PATH = path.join(DATA_DIR, 'backlog.json');

export const DEFAULT_SETTINGS = { theme: 'dark' };
export const DEFAULT_PASSWORD = 'admin';

export function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let _config = null;

export function loadConfig() {
  ensureDirs();
  if (!fs.existsSync(CONFIG_PATH)) {
    const config = {
      passwordHash: bcrypt.hashSync(DEFAULT_PASSWORD, 10),
      jwtSecret: crypto.randomBytes(32).toString('hex'),
      settings: { ...DEFAULT_SETTINGS },
      _defaultPassword: true
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.warn('\n[Dashboard] No config found — created data/config.json with DEFAULT password "admin".');
    console.warn('[Dashboard] Change it now with:  node setup.js\n');
    return config;
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  config.settings = { ...DEFAULT_SETTINGS, ...(config.settings || {}) };
  return config;
}

export function getConfig() {
  if (!_config) _config = loadConfig();
  return _config;
}

export function setConfig(config) {
  _config = config;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  return _config;
}
