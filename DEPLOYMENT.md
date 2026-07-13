# Deployment runbook — Teams + Microsoft 365 SSO on Azure App Service

## ⚡ Quick path (scripted)

Almost everything below is automated by `scripts/deploy-azure.ps1`. Your part:

```powershell
az login                                   # sign in as an Azure/directory admin
./scripts/deploy-azure.ps1 -AppName <globally-unique-name>
```

The script registers the Entra app (SPA redirects, App ID URI, access_as_user
scope, pre-authorized Teams clients, v2 tokens, Graph permissions + admin
consent), creates the resource group / B1 Linux plan / web app, builds and
zip-deploys the app, copies `data/*.json` to persistent `/home/data`, and
produces `teams/client-dashboard-teams.zip`. Then you only:

1. Open `https://<AppName>.azurewebsites.net` and confirm sign-in works.
2. Upload the Teams zip in **Teams Admin Center → Manage apps → Upload new app**
   and publish it to the org.
3. Later, disable the shared password:
   `az webapp config appsettings set -n <AppName> -g rg-client-dashboard --settings DISABLE_PASSWORD_LOGIN=1`

Uses the `<AppName>.azurewebsites.net` domain (valid HTTPS, accepted by Teams),
so no DNS/custom-domain work is required. Re-run the script any time to
redeploy — server data is not overwritten unless you pass `-ForceData`.

The manual reference below covers the same ground step by step (useful if the
script hits a policy restriction in your tenant, e.g. on identifier URIs).

---

This guides you from the current localhost app to an internal app published in
Microsoft Teams, signed in with Microsoft 365 (Entra ID). It runs as one Azure
App Service serving both the API and the built SPA from the same origin.

The values you create flow into several places, so capture them as you go:

| Value | Example | Used in |
|-------|---------|---------|
| Tenant ID | `1111…` GUID | App settings, manifest |
| Application (client) ID | `2222…` GUID | App settings, manifest |
| App domain | `clientdash.techsuccess.com.au` | App Service, manifest |
| Application ID URI | `api://clientdash.techsuccess.com.au/2222…` | App settings, manifest |
| API scope | `…/access_as_user` | Frontend build |

---

## 1. Register the Entra ID application

Azure Portal → **Microsoft Entra ID** → **App registrations** → **New
registration**.

1. **Name:** `Tech Success Client Dashboard`.
2. **Supported account types:** *Accounts in this organizational directory only*
   (**single tenant**). This is what limits sign-in to Tech Success staff.
3. **Redirect URI:** platform *Single-page application (SPA)*, value
   `https://<APP_DOMAIN>/` (add `http://localhost:5273/` too for local dev).
4. Register, then from **Overview** copy the **Application (client) ID** and
   **Directory (tenant) ID**.

### Expose the API (so the app can validate tokens)

App registration → **Expose an API**:

1. **Set** the *Application ID URI* to
   `api://<APP_DOMAIN>/<client-id>` (the portal suggests this format).
2. **Add a scope:** name `access_as_user`, who can consent *Admins and users*,
   enabled. This is the `VITE_ENTRA_API_SCOPE` (full value
   `api://<APP_DOMAIN>/<client-id>/access_as_user`).
3. **Pre-authorize the Teams clients** (so SSO is silent inside Teams — no extra
   consent prompt). Add these client IDs against the `access_as_user` scope:
   - `1fec8e78-bce4-4aaf-ab1b-5451cc387264` (Teams desktop/mobile)
   - `5e3ce6c0-2b1f-4285-8d4b-75ee78787346` (Teams web)

### API permissions

App registration → **API permissions** → add Microsoft Graph **delegated**
`openid`, `profile`, `email`, `User.Read`. Grant admin consent for the tenant.

---

## 2. Create and deploy the Azure App Service

Azure Portal → **App Services** → **Create**.

1. **Runtime stack:** Node 18 LTS (or 20), **OS: Linux**.
2. **Plan:** Basic **B1** is plenty for internal use; scale up later if needed.
   **Keep it to a single instance** (no scale-out) — the JSON data files are
   shared via the instance's persistent `/home`, and the app serialises writes
   per process, which assumes one instance.
3. After creation, set the **startup command** to `node server/index.js`
   (App Service → Configuration → General settings).

### Deploy the code

Option A — **Zip deploy** (quickest):
```powershell
# from the repo root, after building the client
npm run build
Compress-Archive -Path server,client/dist,package.json,package-lock.json,setup.js -DestinationPath app.zip -Force
# then: az webapp deploy --resource-group <rg> --name <app> --src-path app.zip --type zip
```
Make sure `client/dist` is included — the server serves it. Run `npm install
--omit=dev` on the App Service (enable **SCM_DO_BUILD_DURING_DEPLOYMENT=true**)
so production deps install on the host.

Option B — **GitHub Actions**: use the App Service *Deployment Center* to wire
the GitHub repo; it generates a workflow that builds and deploys on push to
`main`.

> **Data note:** `data/` is gitignored and starts empty on a fresh deploy. Copy
> your real `data/clients.json`, `data/catalog.json`, and `data/config.json` to
> `/home/site/wwwroot/data` on the App Service (via SSH or FTPS) once, then it
> persists. Set up a periodic backup of that folder (or an `az webapp` cron) —
> it holds the only copy of client data.

---

## 3. Custom domain + HTTPS

App Service → **Custom domains** → add `clientdash.techsuccess.com.au`
(CNAME to the `*.azurewebsites.net` host), then **Add binding** and create a free
**App Service Managed Certificate**. Teams requires a valid public HTTPS cert —
the managed cert satisfies this.

---

## 4. App settings (environment variables)

App Service → **Settings → Environment variables → Application settings**. Add:

| Name | Value |
|------|-------|
| `ENTRA_TENANT_ID` | your tenant ID |
| `ENTRA_CLIENT_ID` | your application (client) ID |
| `ENTRA_APP_ID_URI` | `api://<APP_DOMAIN>/<client-id>` |
| `DISABLE_PASSWORD_LOGIN` | `1` (set this **after** confirming SSO works) |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~18` |

The frontend SSO values (`VITE_ENTRA_*`) are **build-time** — set them in your
build environment (GitHub Actions secrets or local shell) before `npm run build`,
not as App Service settings.

---

## 5. Build and publish the Teams app

See `teams/README.md`. In short: fill the placeholders in `teams/manifest.json`,
add `color.png` + `outline.png`, zip, then sideload for testing and publish to
the org app catalogue via Teams Admin Center.

---

## 6. Rollout order (so nobody gets locked out)

1. Deploy with the **password login still enabled** and Entra vars set. Confirm
   the app loads at `https://<APP_DOMAIN>` and password login works.
2. Sideload the Teams app to **yourself**, confirm SSO signs you in silently.
3. Publish org-wide.
4. Once staff confirm Teams sign-in works, set `DISABLE_PASSWORD_LOGIN=1` to
   retire the shared password.

---

## What's already done in the code

- **Backend** accepts Entra access tokens (validated against your tenant's JWKS)
  *and* the legacy password JWT, selected automatically — see `server/entra.js`
  and `server/auth.js`. `GET /api/auth/config` reports which modes are active;
  `GET /api/auth/me` returns the signed-in user.
- **Teams manifest** template — `teams/manifest.json`.
- **Env var contract** — `.env.example`.

## Frontend SSO (done)

The SPA signs in via `client/src/entra-auth.js`: silent Teams SSO inside Teams
(`getAuthToken`), MSAL silent/popup in a browser. It reads the public Entra
identifiers from `GET /api/auth/config` at runtime — no build-time variables.
The login screen shows a "Sign in with Microsoft 365" button when Entra is
configured, with the admin password as a fallback until
`DISABLE_PASSWORD_LOGIN=1` is set.
