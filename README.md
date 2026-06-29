# Tech Success — Client Dashboard

A self-hosted dashboard for tracking the status of MSP clients: products/services
(with a per-client rollout status), projects & issues, account managers, plan status,
sentiment, notes, and quick links (Sharepoint Doc, Client Dashboard, OneNote, IT Boost).

Split out of the internal PSPortal tool — this repo is **just the client dashboard**
(no PowerShell execution features).

- **Backend:** Node.js + Express, JSON flat-file storage in `data/`.
- **Frontend:** React (Vite).
- **Auth:** single password → JWT (8h).

## Quick start

```powershell
# 1. Install dependencies (root + client workspace)
npm install

# 2. (Recommended) set your login password
node setup.js

# 3. Build the UI
npm run build

# 4. Start the server
npm start
```

Then open **http://localhost:4100**. Default password is `admin` until you run `node setup.js`.

### Development mode (live reload)

```powershell
npm run dev
```

Runs the API on `:4100` and the Vite dev server on `:5273` (open `:5273`).

## Data & privacy

All runtime data lives in `data/` and is **git-ignored** — client records, the
password hash, and the JWT secret are never committed. A fresh clone starts empty;
add clients in the UI (the server creates the JSON files on first run).

- `data/clients.json` — clients, products, projects, notes.
- `data/catalog.json` — the standard product list shown on every client.
- `data/config.json` — password hash + JWT secret.

## Features

- **Board view** — client cards grouped by account manager (or health), showing
  product pills (status-coloured), a sentiment rating, plan status, and the
  projects/issues list.
- **Projects view** — a table of all projects/issues across clients, filterable by
  project manager and status.
- **Expanded client view** — read-only overview + an append-only notes log + quick
  links; an Edit button opens the full editor.
- **Standard product catalog** — locked template products applied to every client,
  plus per-client custom products.
