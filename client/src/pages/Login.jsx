import React, { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import BrandLogo from '../components/BrandLogo.jsx';

export default function Login() {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const { token } = await api.login(password);
      login(token);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <BrandLogo className="logo" size={32} /> Client Dashboard
        </div>
        <p className="muted">Tech Success — MSP client tracker</p>
        <input
          type="password"
          autoFocus
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <div className="error">{err}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="hint">
          Default password is <code>admin</code>. Change it with <code>node setup.js</code>.
        </div>
      </form>
    </div>
  );
}
