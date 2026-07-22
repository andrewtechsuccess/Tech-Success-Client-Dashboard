import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useData } from '../data.jsx';
import Clients from './Clients.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

// Editor for one product's implementation task template. Changes save
// immediately (they apply to every client's backlog page at render time).
function TaskTemplateEditor({ tasks, busy, onChange }) {
  const [text, setText] = useState('');

  const add = () => {
    const t = text.trim();
    if (!t) return;
    onChange([...tasks, { title: t }]);
    setText('');
  };
  const remove = (i) => onChange(tasks.filter((_, x) => x !== i));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= tasks.length) return;
    const copy = [...tasks];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  };

  return (
    <div className="cat-tasks">
      {tasks.length === 0 && <div className="muted sm">No implementation tasks yet — add the first one below.</div>}
      {tasks.map((t, i) => (
        <div className="catalog-row" key={t.id || `${t.title}-${i}`}>
          <span className="catalog-name">{t.title}</span>
          <button className="icon-btn catalog-btn" title="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}>
            ↑
          </button>
          <button
            className="icon-btn catalog-btn"
            title="Move down"
            disabled={busy || i === tasks.length - 1}
            onClick={() => move(i, 1)}
          >
            ↓
          </button>
          <button className="icon-btn catalog-btn del" title="Remove task" disabled={busy} onClick={() => remove(i)}>
            ✕
          </button>
        </div>
      ))}
      <div className="task-add">
        <input
          placeholder="Add an implementation task…"
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
    </div>
  );
}

// Editor for the global standard-product catalog. Saving re-applies the list
// to EVERY client: existing per-client statuses are kept (matched by name),
// new products appear as "Not started", removed products disappear everywhere.
// Each product also carries an implementation task template (the backlog).
function CatalogEditor() {
  const { reload } = useData();
  const [saved, setSaved] = useState(null); // last-saved list (null = loading)
  const [names, setNames] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(null); // { list, removed }
  const [templates, setTemplates] = useState(null); // product → task template
  const [tplBusy, setTplBusy] = useState(false);
  const [openTasks, setOpenTasks] = useState(null); // product name expanded

  useEffect(() => {
    (async () => {
      try {
        const [{ products }, backlog] = await Promise.all([api.catalog(), api.backlog()]);
        setSaved(products);
        setNames(products);
        setTemplates(backlog.templates);
      } catch (e) {
        setErr(e.message);
        setSaved([]);
        setTemplates({});
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

  // Replace one product's task template. Saved immediately — task lists are
  // merged into every client's backlog page at render time.
  const saveTemplate = async (product, tasks) => {
    setTplBusy(true);
    setErr('');
    try {
      const next = { ...templates, [product]: tasks };
      if (!tasks.length) delete next[product];
      const res = await api.setBacklogTemplates(next);
      setTemplates(res.templates);
    } catch (e) {
      setErr(e.message);
    } finally {
      setTplBusy(false);
    }
  };

  if (saved === null || templates === null) return <div className="muted">Loading catalog…</div>;

  return (
    <div className="card settings-card">
      <h3>Standard products</h3>
      <p className="muted sm">
        These appear on <b>every</b> client card, each tracked per client through its rollout status. New products
        start as “Not started”; per-client statuses are kept when you reorder. To rename a product, remove it and add
        the new name (statuses reset — it's treated as a new product). Each product's <b>Tasks</b> list is its
        implementation checklist, tracked per client on the Backlog page.
      </p>

      {names.length === 0 ? (
        <div className="muted sm">No standard products — add the first one below.</div>
      ) : (
        <div className="catalog-list">
          {names.map((n, i) => {
            const isSaved = (saved || []).includes(n);
            const count = (templates[n] || []).length;
            const open = openTasks === n;
            return (
              <React.Fragment key={n}>
                <div className="catalog-row">
                  <span className="catalog-name">{n}</span>
                  {isSaved ? (
                    <button
                      className={`btn ghost sm cat-tasks-btn${open ? ' on' : ''}`}
                      disabled={busy}
                      title="Edit this product's implementation tasks"
                      onClick={() => setOpenTasks(open ? null : n)}
                    >
                      Tasks ({count}) {open ? '▴' : '▾'}
                    </button>
                  ) : (
                    <span className="muted sm nowrap">save first</span>
                  )}
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
                {open && isSaved && (
                  <TaskTemplateEditor tasks={templates[n] || []} busy={tplBusy} onChange={(tasks) => saveTemplate(n, tasks)} />
                )}
              </React.Fragment>
            );
          })}
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

// Engineer roster used by the backlog page's assignment dropdown. Changes save
// immediately; removing a name never clears existing task assignments.
function EngineersEditor() {
  const [list, setList] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { engineers } = await api.backlog();
        setList(engineers);
      } catch (e) {
        setErr(e.message);
        setList([]);
      }
    })();
  }, []);

  const save = async (next) => {
    setBusy(true);
    setErr('');
    try {
      const res = await api.setBacklogEngineers(next);
      setList(res.engineers);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const t = text.trim();
    if (!t) return;
    if (list.some((n) => n.toLowerCase() === t.toLowerCase())) {
      setErr(`“${t}” is already in the list.`);
      return;
    }
    setErr('');
    setText('');
    save([...list, t]);
  };

  if (list === null) return <div className="muted">Loading engineers…</div>;

  return (
    <div className="card settings-card">
      <h3>Engineers</h3>
      <p className="muted sm">
        The people backlog tasks can be assigned to. Removing a name here doesn't unassign their existing tasks.
      </p>
      {list.length === 0 ? (
        <div className="muted sm">No engineers yet — add the first one below.</div>
      ) : (
        <div className="catalog-list">
          {list.map((n, i) => (
            <div className="catalog-row" key={n}>
              <span className="catalog-name">{n}</span>
              <button
                className="icon-btn catalog-btn del"
                title="Remove engineer"
                disabled={busy}
                onClick={() => save(list.filter((_, x) => x !== i))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="task-add">
        <input
          placeholder="Add an engineer…"
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
    </div>
  );
}

// Global settings: client management (moved from the old Clients tab), the
// standard-product catalog (with implementation task templates), and the
// engineer roster.
export default function Settings() {
  const [tab, setTab] = useState('clients'); // 'clients' | 'products' | 'engineers'
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
        <button className={`tab${tab === 'engineers' ? ' on' : ''}`} onClick={() => setTab('engineers')}>
          Engineers
        </button>
      </div>
      {tab === 'clients' ? <Clients /> : tab === 'products' ? <CatalogEditor /> : <EngineersEditor />}
    </div>
  );
}
