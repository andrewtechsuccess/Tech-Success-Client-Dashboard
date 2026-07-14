import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useData } from '../data.jsx';
import Clients from './Clients.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

// Editor for the global standard-product catalog. Saving re-applies the list
// to EVERY client: existing per-client statuses are kept (matched by name),
// new products appear as "Not started", removed products disappear everywhere.
function CatalogEditor() {
  const { reload } = useData();
  const [saved, setSaved] = useState(null); // last-saved list (null = loading)
  const [names, setNames] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(null); // { list, removed }

  useEffect(() => {
    (async () => {
      try {
        const { products } = await api.catalog();
        setSaved(products);
        setNames(products);
      } catch (e) {
        setErr(e.message);
        setSaved([]);
      }
    })();
  }, []);

  const dirty = useMemo(() => JSON.stringify(names) !== JSON.stringify(saved), [names, saved]);

  const add = () => {
    const t = text.trim();
    if (!t) return;
    if (names.some((n) => n.toLowerCase() === t.toLowerCase())) {
      setErr(`“${t}” is already in the list.`);
      return;
    }
    setErr('');
    setMsg('');
    setNames([...names, t]);
    setText('');
  };
  const remove = (i) => {
    setMsg('');
    setNames(names.filter((_, x) => x !== i));
  };
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= names.length) return;
    const copy = [...names];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setMsg('');
    setNames(copy);
  };

  const doSave = async (list) => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await api.setCatalog(list);
      setSaved(res.products);
      setNames(res.products);
      setText('');
      await reload();
      setMsg(`Saved — applied to ${res.clientsUpdated} client${res.clientsUpdated === 1 ? '' : 's'}.`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    // Anything still sitting in the add box counts as an add — people type a
    // name and go straight for Save.
    let list = names;
    const pending = text.trim();
    if (pending) {
      if (names.some((n) => n.toLowerCase() === pending.toLowerCase())) {
        setErr(`“${pending}” is already in the list.`);
        return;
      }
      list = [...names, pending];
    }
    const removed = (saved || []).filter((n) => !list.includes(n));
    if (removed.length) {
      setConfirmRemove({ list, removed }); // in-app dialog (window.confirm is blocked inside Teams)
      return;
    }
    doSave(list);
  };

  if (saved === null) return <div className="muted">Loading catalog…</div>;

  return (
    <div className="card settings-card">
      <h3>Standard products</h3>
      <p className="muted sm">
        These appear on <b>every</b> client card, each tracked per client through its rollout status. New products
        start as “Not started”; per-client statuses are kept when you reorder. To rename a product, remove it and add
        the new name (statuses reset — it's treated as a new product).
      </p>

      {names.length === 0 ? (
        <div className="muted sm">No standard products — add the first one below.</div>
      ) : (
        <div className="catalog-list">
          {names.map((n, i) => (
            <div className="catalog-row" key={n}>
              <span className="catalog-name">{n}</span>
              <button className="icon-btn catalog-btn" title="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button
                className="icon-btn catalog-btn"
                title="Move down"
                disabled={busy || i === names.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button className="icon-btn catalog-btn del" title="Remove from all clients" disabled={busy} onClick={() => remove(i)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="task-add">
        <input
          placeholder="Add a standard product…"
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn ghost sm" onClick={add} disabled={busy || !text.trim()}>
          Add
        </button>
      </div>

      {err && <div className="error">{err}</div>}
      {msg && <div className="ok-msg">{msg}</div>}

      <div className="actions">
        <button className="btn primary" onClick={save} disabled={busy || (!dirty && !text.trim())}>
          {busy ? 'Applying to all clients…' : 'Save & apply to all clients'}
        </button>
        {dirty && (
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => {
              setNames(saved);
              setErr('');
              setMsg('');
            }}
          >
            Reset
          </button>
        )}
      </div>

      {confirmRemove && (
        <ConfirmDialog
          title="Remove from every client?"
          message={`${confirmRemove.removed.map((r) => `“${r}”`).join(', ')} will be removed from all clients, and each client's rollout status for ${confirmRemove.removed.length === 1 ? 'it' : 'them'} will be lost. This cannot be undone.`}
          confirmLabel="Remove & apply"
          danger
          onConfirm={() => {
            const list = confirmRemove.list;
            setConfirmRemove(null);
            doSave(list);
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
}

// Global settings: client management (moved from the old Clients tab) and the
// standard-product catalog.
export default function Settings() {
  const [tab, setTab] = useState('clients'); // 'clients' | 'products'
  return (
    <div className="page">
      <div className="exec-head">
        <h2>Settings</h2>
      </div>
      <div className="view-tabs">
        <button className={`tab${tab === 'clients' ? ' on' : ''}`} onClick={() => setTab('clients')}>
          Clients
        </button>
        <button className={`tab${tab === 'products' ? ' on' : ''}`} onClick={() => setTab('products')}>
          Standard products
        </button>
      </div>
      {tab === 'clients' ? <Clients /> : <CatalogEditor />}
    </div>
  );
}
