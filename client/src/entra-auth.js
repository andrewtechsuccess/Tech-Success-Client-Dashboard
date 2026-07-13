// Microsoft 365 sign-in for the SPA. Config (tenant/client id) comes from the
// server at runtime via /api/auth/config, so builds carry no environment.
//
// Token strategy, in order:
//   1. Inside Microsoft Teams  -> teams-js getAuthToken() (silent SSO; the
//      token's audience is our App ID URI, accepted by the API directly).
//   2. In a browser, silently  -> MSAL acquireTokenSilent with a cached account.
//   3. In a browser, interactive -> MSAL loginPopup.
// Expired tokens surface as a 401 -> the app logs out -> the login screen
// re-runs the silent path, so renewal is a seamless loop.
import { PublicClientApplication } from '@azure/msal-browser';
import { app as teamsApp, authentication as teamsAuth } from '@microsoft/teams-js';

let entraCfg = null;
let msal = null;
let teamsChecked = false;
let isTeams = false;

export async function fetchAuthConfig() {
  const res = await fetch('/api/auth/config');
  if (!res.ok) throw new Error('Could not load auth config');
  const cfg = await res.json();
  entraCfg = cfg.entraConfig || null;
  return cfg;
}

// Detect the Teams host. teams-js initialize() resolves quickly inside Teams
// (desktop/web/mobile) and hangs/rejects outside it, hence the timeout race.
export async function inTeams() {
  if (teamsChecked) return isTeams;
  teamsChecked = true;
  if (window.self === window.top || !entraCfg) {
    isTeams = false;
    return false;
  }
  try {
    await Promise.race([
      teamsApp.initialize(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('not teams')), 2000))
    ]);
    isTeams = true;
  } catch {
    isTeams = false;
  }
  return isTeams;
}

async function getMsal() {
  if (!msal) {
    msal = new PublicClientApplication({
      auth: {
        clientId: entraCfg.clientId,
        authority: `https://login.microsoftonline.com/${entraCfg.tenantId}`,
        redirectUri: `${window.location.origin}/`
      },
      cache: { cacheLocation: 'localStorage' }
    });
    await msal.initialize();
  }
  return msal;
}

// Silent sign-in. Returns an access token, or null if interaction is needed.
export async function entraSilent() {
  if (!entraCfg) return null;
  if (await inTeams()) {
    try {
      return await teamsAuth.getAuthToken();
    } catch {
      return null; // Teams SSO not consented yet / failed — fall through
    }
  }
  try {
    const m = await getMsal();
    const account = m.getActiveAccount() || m.getAllAccounts()[0];
    if (!account) return null;
    const res = await m.acquireTokenSilent({ scopes: [entraCfg.scope], account });
    return res.accessToken;
  } catch {
    return null;
  }
}

// Interactive browser sign-in (popup). Not used inside Teams.
export async function entraInteractive() {
  if (!entraCfg) throw new Error('Microsoft 365 sign-in is not configured');
  const m = await getMsal();
  const res = await m.loginPopup({ scopes: [entraCfg.scope], prompt: 'select_account' });
  m.setActiveAccount(res.account);
  return res.accessToken;
}
