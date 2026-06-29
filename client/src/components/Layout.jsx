import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Layout({ children }) {
  const { logout } = useAuth();
  const { pathname } = useLocation();
  const active = (p) => (pathname === p ? 'topnav on' : 'topnav');

  return (
    <div className="app">
      <div className="main">
        <header className="topbar">
          <div className="brand" style={{ padding: 0 }}>
            <span className="logo">📊</span> Client Dashboard
          </div>
          <div className="spacer" />
          <Link className={active('/')} to="/">
            Dashboard
          </Link>
          <Link className={active('/clients')} to="/clients">
            Clients
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
