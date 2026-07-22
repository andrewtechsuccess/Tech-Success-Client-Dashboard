import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useData } from '../data.jsx';
import {
  BACKLOG_STATUSES,
  BACKLOG_STATUS_LABEL,
  clientBacklogTask,
  backlogProgress
} from '../dashboard.js';

const fmtDue = (iso) => {
  if (!iso) return '';
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
};

function ProgressBar({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="bl-bar" title={`${done}/${total} tasks completed`}>
      <div className={`bl-bar-fill${total && done === total ? ' full' : ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// Click-to-change status menu for a backlog task, positioned (fixed) under the
// anchor pill. Same pattern as the dashboard's QuickMenu: closes on select,
// outside-click, Esc, scroll, or resize.
function StatusMenu({ menu, onSelect, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    const onDown = (e) => {
      if (!e.target.closest('.quick-menu')) onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [onClose]);

  const { task, status, rect } = menu;
  const width = 190;
  const left = Math.min(rect.left, window.innerWidth - width - 12);
  const style = { position: 'fixed', top: rect.bottom + 6, left: Math.max(8, left), width };

  return (
    <div className="quick-menu" style={style} role="menu">
      <div className="qm-title">{task.title}</div>
      {BACKLOG_STATUSES.map((o) => (
        <button
          key={o.value}
          className={`qm-item${o.value === status ? ' on' : ''}`}
          role="menuitemradio"
          aria-checked={o.value === status}
          onClick={() => onSelect(o.value)}
        >
          <span className={`bl-pill ${o.value}`}>{o.label}</span>
          {o.value === status && <span className="qm-check">✓</span>}
        </button>
      ))}
    </div>
  );
}

// Index view: every client with its overall implementation progress.
function BacklogIndex({ clients, meta }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...clients]
      .filter((c) => !needle || c.name.toLowerCase().includes(needle) || (c.code || '').toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, q]);

  const hasTemplates = Object.keys(meta.templates).length > 0;

  return (
    <div className="page">
      <div className="exec-head">
        <h2>Implementation backlog</h2>
      </div>
      <p className="muted sm">
        Each standard product's implementation tasks, tracked per client. Edit the task templates under{' '}
        <Link to="/settings">Settings → Standard products</Link>.
      </p>
      {!hasTemplates && (
        <div className="card settings-card">
          No implementation tasks defined yet — add tasks to your standard products in{' '}
          <Link to="/settings">Settings → Standard products</Link> and they'll appear here for every client.
        </div>
      )}
      {hasTemplates && (
        <>
          <input className="bl-search" placeholder="Search clients…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="bl-client-list">
            {rows.map((c) => {
              const prog = backlogProgress(c, meta.templates, meta.order);
              return (
                <Link className="bl-client-row" to={`/backlog/${c.id}`} key={c.id}>
                  <span className="swatch" style={{ background: c.color || '#3b82f6' }} />
                  <span className="bl-cname">{c.name}</span>
                  {c.code && <span className="code">{c.code}</span>}
                  <ProgressBar done={prog.done} total={prog.total} />
                  <span className="bl-count muted sm">
                    {prog.done}/{prog.total}
                  </span>
                </Link>
              );
            })}
            {!rows.length && <div className="muted sm">No clients match “{q}”.</div>}
          </div>
        </>
      )}
    </div>
  );
}

// Full-page backlog for one client: template tasks grouped by product, each
// with a per-client status, assigned engineer, and due date.
function ClientBacklog({ client, meta }) {
  const { reload } = useData();
  const [menu, setMenu] = useState(null); // { product, task, status, rect }
  const [busyKey, setBusyKey] = useState('');
  const [err, setErr] = useState('');

  const patchTask = async (product, taskId, patch) => {
    setBusyKey(`${product}:${taskId}`);
    setErr('');
    try {
      await api.setBacklogTask(client.id, { product, taskId, ...patch });
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyKey('');
    }
  };

  const sections = [];
  const skipped = [];
  for (const name of meta.order) {
    const tasks = meta.templates[name] || [];
    if (!tasks.length) continue;
    const prod = (client.products || []).find((p) => p.template && p.name === name);
    if (prod && prod.status === 'not_needed') {
      skipped.push(name);
      continue;
    }
    sections.push({ name, tasks });
  }
  const overall = backlogProgress(client, meta.templates, meta.order);

  return (
    <div className="page">
      <div className="exec-head bl-head">
        <Link className="btn ghost sm" to="/backlog">
          ← All clients
        </Link>
        <span className="swatch" style={{ background: client.color || '#3b82f6' }} />
        <h2>{client.name}</h2>
        {client.code && <span className="code">{client.code}</span>}
        <div className="spacer" />
        <ProgressBar done={overall.done} total={overall.total} />
        <span className="bl-count muted sm">
          {overall.done}/{overall.total} tasks
        </span>
        <Link className="btn ghost sm" to={`/roadmap/${client.id}`}>
          Roadmap
        </Link>
      </div>
      {err && <div className="error">{err}</div>}

      {sections.map(({ name, tasks }) => {
        const done = tasks.filter((t) => clientBacklogTask(client, name, t).status === 'completed').length;
        return (
          <div className="card bl-section" key={name}>
            <div className="bl-sec-head">
              <h3>{name}</h3>
              <ProgressBar done={done} total={tasks.length} />
              <span className="bl-count muted sm">
                {done}/{tasks.length}
              </span>
            </div>
            <div className="task-list">
              {tasks.map((t) => {
                const cur = clientBacklogTask(client, name, t);
                const busy = busyKey === `${name}:${t.id}`;
                return (
                  <div className={`task-item bl-task${cur.status === 'completed' ? ' done' : ''}`} key={t.id}>
                    <button
                      type="button"
                      className={`bl-pill quick ${cur.status}`}
                      disabled={busy}
                      title="Change status"
                      onClick={(e) =>
                        setMenu({
                          product: name,
                          task: t,
                          status: cur.status,
                          rect: e.currentTarget.getBoundingClientRect()
                        })
                      }
                    >
                      {BACKLOG_STATUS_LABEL[cur.status]}
                    </button>
                    <span className="task-text">{t.title}</span>
                    <select
                      className="bl-eng"
                      value={cur.engineer}
                      disabled={busy}
                      title="Assigned engineer"
                      onChange={(e) => patchTask(name, t.id, { engineer: e.target.value })}
                    >
                      <option value="">Unassigned</option>
                      {meta.engineers.map((en) => (
                        <option key={en} value={en}>
                          {en}
                        </option>
                      ))}
                      {cur.engineer && !meta.engineers.includes(cur.engineer) && (
                        <option value={cur.engineer}>{cur.engineer}</option>
                      )}
                    </select>
                    <input
                      className="bl-due"
                      type="date"
                      value={cur.due}
                      disabled={busy}
                      title={cur.due ? `Due ${fmtDue(cur.due)}` : 'Set a due date'}
                      onChange={(e) => patchTask(name, t.id, { due: e.target.value })}
                    />
                    <button
                      type="button"
                      className="btn ghost sm bl-cw"
                      disabled
                      title="ConnectWise integration coming soon — this will create a ticket for this task"
                    >
                      + Ticket
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {!sections.length && (
        <div className="card settings-card">
          Nothing to implement — no standard products with task templates apply to this client.
        </div>
      )}
      {skipped.length > 0 && (
        <p className="muted sm">Hidden (marked “Not needed” for this client): {skipped.join(', ')}.</p>
      )}

      {menu && (
        <StatusMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onSelect={(value) => {
            const m = menu;
            setMenu(null);
            if (value !== m.status) patchTask(m.product, m.task.id, { status: value });
          }}
        />
      )}
    </div>
  );
}

export default function Backlog() {
  const { clientId } = useParams();
  const { clients, loaded } = useData();
  const [meta, setMeta] = useState(null); // { templates, engineers, order }
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [{ templates, engineers }, { products }] = await Promise.all([api.backlog(), api.catalog()]);
        setMeta({ templates, engineers, order: products });
      } catch (e) {
        setErr(e.message);
      }
    })();
  }, []);

  if (err)
    return (
      <div className="page">
        <div className="error">{err}</div>
      </div>
    );
  if (!loaded || !meta)
    return (
      <div className="page">
        <div className="muted">Loading backlog…</div>
      </div>
    );

  if (clientId) {
    const client = clients.find((c) => c.id === clientId);
    if (!client)
      return (
        <div className="page">
          <div className="error">Client not found.</div>
          <Link className="btn ghost sm" to="/backlog">
            ← All clients
          </Link>
        </div>
      );
    return <ClientBacklog client={client} meta={meta} />;
  }
  return <BacklogIndex clients={clients} meta={meta} />;
}
