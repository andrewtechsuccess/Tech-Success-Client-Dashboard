# Teams app package

This folder builds the Microsoft Teams app that embeds the Client Dashboard as a
personal tab, signed in with Microsoft 365 SSO.

## Files

- `manifest.json` — the Teams app manifest (uses `${...}` placeholders).
- `color.png` — **you must add this.** 192×192 PNG, full-colour app icon.
- `outline.png` — **you must add this.** 32×32 PNG, transparent background, single
  colour (white) outline. Used in the Teams sidebar.

> Tip: export both from `client/src/components/BrandLogo.jsx` (the green shield).
> `color.png` on a dark `#0B1220` square, `outline.png` as a white silhouette.

## Build steps

1. Replace the placeholders in `manifest.json` with your real values:
   - `${ENTRA_CLIENT_ID}` → the Entra **Application (client) ID** (a GUID).
   - `${APP_DOMAIN}` → your host, e.g. `clientdash.techsuccess.com.au`.
   - `${APP_ID_URI}` → the **Application ID URI**, e.g.
     `api://clientdash.techsuccess.com.au/<client-id>`.
2. Add `color.png` and `outline.png` to this folder.
3. Zip the **contents** of this folder (not the folder itself) so the zip has
   `manifest.json`, `color.png`, `outline.png` at its root:
   ```powershell
   Compress-Archive -Path manifest.json,color.png,outline.png -DestinationPath client-dashboard.zip -Force
   ```

## Install

- **Test (sideload):** Teams → Apps → *Manage your apps* → *Upload an app* →
  *Upload a custom app* → pick `client-dashboard.zip`. (Custom-app upload must be
  allowed in your Teams admin setup policy.)
- **Org-wide:** Teams Admin Center → *Teams apps* → *Manage apps* → *Upload new
  app*, then approve/publish so all staff see it in the org catalogue.

See `../DEPLOYMENT.md` for the full end-to-end runbook (Entra registration,
Azure App Service, custom domain, environment variables).
