import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import BrandLogo from './BrandLogo.jsx';

export default function Layout({ children }) {
  const { logout } = useAuth();
  const { pathname } = useLocation();
  // Prefix match so /backlog/:clientId keeps the Backlog tab lit.
  const active = (p) => (p === '/' ? pathname === p : pathname === p || pathname.startsWith(`${p}/`)) ? 'topnav on' : 'topnav';

  return (
    <div className="app">
      <div className="main">
        <header className="topbar">
          <div className="brand" style={{ padding: 0 }}>
            <BrandLogo className="logo" size={26} /> Client Dashboard
          </div>
          <div className="spacer" />
          <Link className={active('/')} to="/">
            Dashboard
          </Link>
          <Link className={active('/backlog')} to="/backlog">
            Backlog
          </Link>
          <Link className={active('/roadmap')} to="/roadmap">
            Roadmap
          </Link>
          <Link className={active('/settings')} to="/settings">
            Settings
          </Link>
          <button className="btn ghost sm" onClick={logout}>
            Log out
          </button>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
