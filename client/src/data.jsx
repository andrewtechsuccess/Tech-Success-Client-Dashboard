// Shared app data (clients) loaded after login and kept fresh in the
// background, so several people working at once see each other's changes
// instead of editing from a snapshot taken when their tab was opened.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const DataCtx = createContext(null);

// How often to ask the server whether anything changed. The check is a stat on
// one file, not a read of the data, so this stays cheap with ten browsers open.
const POLL_MS = 20000;

export function DataProvider({ children }) {
  const [clients, setClients] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [syncedAt, setSyncedAt] = useState(null);
  // Server's change token as of our last full load. Compared on every poll.
  const version = useRef(null);
  // Set while a save is in flight: a refresh landing mid-write would show the
  // pre-write state and make the UI flicker backwards.
  const saving = useRef(0);

  const reload = useCallback(async () => {
    // Read the version first. If it moves while we're fetching, the next poll
    // catches it — better than recording a token newer than the data we hold.
    const { version: v } = await api.clientsVersion().catch(() => ({ version: null }));
    setClients(await api.clients());
    version.current = v;
    setSyncedAt(new Date());
  }, []);

  // Apply a single client the server just handed back, instead of re-fetching
  // all 90. Everyone else's changes still arrive via the poll.
  const applyClient = useCallback((updated) => {
    if (!updated?.id) return;
    setClients((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    setSyncedAt(new Date());
  }, []);

  // Wrap a save so polling holds off until it lands, and so the returned
  // client is merged into shared state.
  const save = useCallback(
    async (fn) => {
      saving.current++;
      try {
        const updated = await fn();
        if (updated?.id) applyClient(updated);
        // Our own write moved the file; adopt the new token so the next poll
        // doesn't trigger a redundant full reload.
        version.current = await api.clientsVersion().then((r) => r.version).catch(() => version.current);
        return updated;
      } finally {
        saving.current--;
      }
    },
    [applyClient]
  );

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

  // Background refresh: poll while the tab is visible, and check immediately
  // when it regains focus (someone coming back to a Teams tab after a meeting
  // should not be looking at hours-old data).
  useEffect(() => {
    let stopped = false;

    const check = async () => {
      if (stopped || saving.current > 0 || document.hidden) return;
      try {
        const { version: v } = await api.clientsVersion();
        if (!stopped && v && v !== version.current) await reload();
      } catch {
        /* offline or signed out — the next tick retries */
      }
    };

    const timer = setInterval(check, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [reload]);

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
  }, []);

  return (
    <DataCtx.Provider value={{ clients, reload, applyClient, save, loaded, syncedAt }}>{children}</DataCtx.Provider>
  );
}

export const useData = () => useContext(DataCtx);
