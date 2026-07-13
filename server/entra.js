// Microsoft Entra ID (Azure AD / Microsoft 365) token validation.
//
// When the ENTRA_* environment variables are set, the API accepts access tokens
// issued by your single Entra tenant (so any Tech Success 365 account can sign
// in). Tokens are verified against the tenant's published signing keys (JWKS) —
// we never see or store user passwords. When the vars are NOT set, this module
// is inert and the app falls back to the legacy single-password login.
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const TENANT_ID = process.env.ENTRA_TENANT_ID || '';
const CLIENT_ID = process.env.ENTRA_CLIENT_ID || '';
// Tokens minted for a custom API have `aud` = the App ID URI (api://…/<id>) or
// the bare client id, depending on the token version. Accept both.
const APP_ID_URI = process.env.ENTRA_APP_ID_URI || '';

export const entraEnabled = () => Boolean(TENANT_ID && CLIENT_ID);

// Public (non-secret) identifiers the SPA needs to run its own sign-in.
// Served via /api/auth/config so the frontend needs no build-time env.
export const entraPublicConfig = () =>
  entraEnabled()
    ? {
        tenantId: TENANT_ID,
        clientId: CLIENT_ID,
        appIdUri: APP_ID_URI || `api://${CLIENT_ID}`,
        scope: `${APP_ID_URI || `api://${CLIENT_ID}`}/access_as_user`
      }
    : null;

// v2.0 issuer for a single tenant.
const ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;

let _client = null;
function client() {
  if (!_client) {
    _client = jwksClient({
      jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,
      cache: true,
      cacheMaxAge: 24 * 60 * 60 * 1000,
      rateLimit: true
    });
  }
  return _client;
}

function getSigningKey(header, cb) {
  client().getSigningKey(header.kid, (err, key) => {
    if (err) return cb(err);
    cb(null, key.getPublicKey());
  });
}

// Verify an Entra-issued access token. Resolves with the decoded claims, or
// rejects if the signature, issuer, or audience don't check out.
export function verifyEntraToken(token) {
  return new Promise((resolve, reject) => {
    if (!entraEnabled()) return reject(new Error('Entra not configured'));
    jwt.verify(
      token,
      getSigningKey,
      {
        audience: [CLIENT_ID, APP_ID_URI].filter(Boolean),
        issuer: ISSUER,
        algorithms: ['RS256']
      },
      (err, decoded) => (err ? reject(err) : resolve(decoded))
    );
  });
}

// Normalize the claims we care about into a small user object.
export function userFromClaims(claims) {
  return {
    id: claims.oid || claims.sub,
    name: claims.name || claims.preferred_username || 'Tech Success user',
    email: claims.preferred_username || claims.upn || '',
    via: 'entra'
  };
}
