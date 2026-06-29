import React, { createContext, useContext, useEffect, useState } from 'react';
import { getToken, setToken } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [token, setTok] = useState(getToken());

  useEffect(() => {
    const onLogout = () => setTok(null);
    window.addEventListener('tscd-logout', onLogout);
    return () => window.removeEventListener('tscd-logout', onLogout);
  }, []);

  const login = (t) => {
    setToken(t);
    setTok(t);
  };
  const logout = () => {
    setToken(null);
    setTok(null);
  };

  return <AuthCtx.Provider value={{ token, login, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
