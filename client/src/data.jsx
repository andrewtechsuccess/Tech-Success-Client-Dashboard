// Shared app data (clients) loaded once after login and refreshable by pages
// that mutate them.
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const DataCtx = createContext(null);

export function DataProvider({ children }) {
  const [clients, setClients] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    setClients(await api.clients());
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await reload();
      } catch {
        /* handled by the 401 logout flow */
      }
      setLoaded(true);
    })();
  }, [reload]);

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
  }, []);

  return <DataCtx.Provider value={{ clients, reload, loaded }}>{children}</DataCtx.Provider>;
}

export const useData = () => useContext(DataCtx);
