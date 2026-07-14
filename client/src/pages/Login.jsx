import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import { fetchAuthConfig, entraSilent, entraInteractive } from '../entra-auth.js';

// Sign-in screen. When Microsoft 365 (Entra) is configured it tries silent SSO
// first (instant inside Teams, cached-account in a browser) and shows a
// Microsoft button; the shared-password form remains as a fallback while
// enabled on the server.
export default function Login() {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState(null); // { entra, passwordLogin }
  const [trying, setTrying] = useState(true); // silent SSO attempt in flight
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await fetchAuthConfig();
        if (cancelled) return;
        setCfg(c);
        if (c.entra) {
          const token = await entraSilent();
          if (!cancelled && token) {
            login(token);
            return;
          }
        }
      } catch {
        /* fall through to manual sign-in */
      }
      if (!cancelled) setTrying(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [login]);

  const microsoftSignIn = async () => {
    setErr('');
    setBusy(true);
    try {
      const token = (await entraSilent()) || (await entraInteractive());
      login(token);
    } catch (e) {
      setErr(e.message || 'Microsoft sign-in failed');
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const { token } = await api.login(password);
      login(token);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  const entra = !!cfg?.entra;
  const passwordLogin = cfg ? cfg.passwordLogin !== false : true;
  const passwordVisible = passwordLogin && (!entra || showPassword);

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <BrandLogo className="logo" size={32} /> Client Dashboard
        </div>
        <p className="muted">Tech Success — MSP client tracker</p>

        {trying ? (
          <div className="muted sm">Checking your Microsoft 365 sign-in…</div>
        ) : (
          <>
            {entra && (
              <button type="button" className="btn primary block" onClick={microsoftSignIn} disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in with Microsoft 365'}
              </button>
            )}

            {passwordVisible && (
              <>
                <input
                  type="password"
                  autoFocus={!entra}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button className={`btn ${entra ? 'ghost' : 'primary'} block`} disabled={busy}>
                  {busy ? 'Signing in…' : 'Sign in with password'}
                </button>
              </>
            )}

            {entra && passwordLogin && !showPassword && (
              <button type="button" className="link-cell login-alt" onClick={() => setShowPassword(true)}>
                Use the admin password instead
              </button>
            )}
          </>
        )}

        {err && <div className="error">{err}</div>}
      </form>
    </div>
  );
}
