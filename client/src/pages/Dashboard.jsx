import React, { useMemo, useState } from 'react';
import { useData } from '../data.jsx';
import {
  clientHealth,
  summarize,
  externalHref,
  visibleProducts,
  sentimentInfo,
  projectOwners,
  PRODUCT_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUSES,
  PRIORITY_LABEL,
  UNASSIGNED
} from '../dashboard.js';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import ClientExpanded from '../components/ClientExpanded.jsx';

function Stat({ n, label, tone = '' }) {
  return (
    <div className={`dash-stat${tone ? ` ${tone}` : ''}`}>
      <div className="ds-num">{n}</div>
      <div className="ds-label">{label}</div>
    </div>
  );
}

function ClientCard({ client, onOpen, onEdit }) {
  const health = clientHealth(client);
  const products = visibleProducts(client);
  const projects = client.projects || [];
  const s = sentimentInfo(client.sentiment);

  return (
    <div
      className="client-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="cc-top">
        <span className="swatch" style={{ background: client.color || '#3b82f6' }} />
        <span className="cc-name">{client.name}</span>
        {client.code && <span className="code">{client.code}</span>}
        <span className={`health-dot ${health.level}`} title={health.label} />
        <button className="cc-edit" title="Edit client" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
          Edit
        </button>
      </div>

      <div className="cc-meta">
        {client.planStatus && <span className="plan-pill">{client.planStatus}</span>}
        <span className="sentiment" title={`Sentiment ${s.value}/5`}>
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} className="sentiment-dot" style={{ background: i <= s.value ? s.color : 'var(--border)' }} />
          ))}
        </span>
      </div>

      {products.length > 0 ? (
        <div className="prod-row">
          {products.map((p) => (
            <span
              key={p.id}
              className={`prod-pill ${p.status}`}
              title={`${p.name} — ${PRODUCT_STATUS_LABEL[p.status]}`}
            >
              {p.name}
            </span>
          ))}
        </div>
      ) : (
        <div className="cc-empty">No products yet</div>
      )}

      <div className="cc-section-title">Projects &amp; issues</div>
      {projects.length > 0 ? (
        <div className="proj-list">
          {projects.map((j) => (
            <div className={`proj-item ${j.status}`} key={j.id} title={PROJECT_STATUS_LABEL[j.status]}>
              <span className="proj-dot" />
              <span className="proj-title">{j.title}</span>
              {j.type === 'issue' && <span className="proj-tag">issue</span>}
              {j.connectwiseLink && (
                <a
                  className="cw-btn"
                  href={externalHref(j.connectwiseLink)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="Open ConnectWise project"
                >
                  ↗
                </a>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="cc-empty">None</div>
      )}
    </div>
  );
}

// Projects view: a flat table of every open (not-complete) project/issue across
// all clients, so you can see all in-flight work in one place.
function ProjectsView({ clients, filter, setFilter, onOpen }) {
  const q = filter.trim().toLowerCase();
  const [owner, setOwner] = useState('all'); // 'all' | 'none' | <name>
  const [status, setStatus] = useState('open'); // 'open' | 'all' | <status>

  const owners = useMemo(() => projectOwners(clients), [clients]);

  const items = useMemo(() => {
    const rows = [];
    for (const c of clients) {
      for (const j of c.projects || []) {
        rows.push({ ...j, clientId: c.id, clientName: c.name, clientCode: c.code, accountManager: c.accountManager });
      }
    }
    let out = rows;
    if (status === 'open') out = out.filter((r) => r.status !== 'completed');
    else if (status !== 'all') out = out.filter((r) => r.status === status);
    if (owner !== 'all') out = out.filter((r) => (r.owner || '').trim() === (owner === 'none' ? '' : owner));
    if (q) out = out.filter((r) => `${r.clientName} ${r.clientCode} ${r.accountManager} ${r.owner || ''} ${r.title}`.toLowerCase().includes(q));
    out.sort((a, b) => a.clientName.localeCompare(b.clientName) || a.title.localeCompare(b.title));
    return out;
  }, [clients, q, owner, status]);

  const clientCount = new Set(items.map((r) => r.clientId)).size;

  return (
    <>
      <div className="dash-controls">
        <input
          className="dash-filter"
          placeholder="Filter projects, clients…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Open (not completed)</option>
          <option value="all">All statuses</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select className="filter-select" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="all">All project managers</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          <option value="none">(Unassigned)</option>
        </select>
        <div className="muted sm">
          {items.length} {items.length === 1 ? 'item' : 'items'} · {clientCount} client{clientCount === 1 ? '' : 's'}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <div className="muted">No projects match the current filters.</div>
        </div>
      ) : (
        <div className="card no-pad">
          <table className="hist">
            <thead>
              <tr>
                <th>Client</th>
                <th>Project / issue</th>
                <th>Project manager</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Due</th>
                <th>Account manager</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={`${r.clientId}/${r.id}`}>
                  <td>
                    <button className="link-cell" onClick={() => onOpen(r.clientId)}>
                      {r.clientName}
                    </button>
                    {r.clientCode && <span className="code">{r.clientCode}</span>}
                  </td>
                  <td>
                    {r.title}
                    {r.type === 'issue' && <span className="proj-tag">issue</span>}
                  </td>
                  <td className="muted">{r.owner || '—'}</td>
                  <td>
                    <span className={`proj-status ${r.status}`}>{PROJECT_STATUS_LABEL[r.status]}</span>
                  </td>
                  <td className="muted">{PRIORITY_LABEL[r.priority] || '—'}</td>
                  <td className="muted">{r.due || '—'}</td>
                  <td className="muted">{r.accountManager || '—'}</td>
                  <td>
                    {r.connectwiseLink && (
                      <a
                        className="cw-btn"
                        href={externalHref(r.connectwiseLink)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open ConnectWise project"
                      >
                        ↗
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function Dashboard() {
  const { clients } = useData();
  const [view, setView] = useState('board'); // 'board' | 'projects'
  const [filter, setFilter] = useState('');
  const [groupBy, setGroupBy] = useState('am'); // 'am' | 'health'
  const [viewId, setViewId] = useState(null); // expanded (read) view
  const [editId, setEditId] = useState(null); // edit drawer

  const q = filter.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return clients;
    return clients.filter((c) => {
      const hay = [
        c.name,
        c.code,
        c.accountManager,
        ...(c.products || []).map((p) => p.name),
        ...(c.projects || []).map((p) => p.title)
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [clients, q]);

  const stats = useMemo(() => summarize(filtered), [filtered]);

  const columns = useMemo(() => {
    const groups = new Map();
    const keyFor = (c) =>
      groupBy === 'health'
        ? clientHealth(c).label
        : (c.accountManager || '').trim() || UNASSIGNED;
    for (const c of filtered) {
      const k = keyFor(c);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    // Named groups alphabetical; "Unassigned" always sorts last.
    const keys = [...groups.keys()].sort((a, b) => {
      if (a === UNASSIGNED) return 1;
      if (b === UNASSIGNED) return -1;
      return a.localeCompare(b);
    });
    return keys.map((k) => ({ key: k, clients: groups.get(k) }));
  }, [filtered, groupBy]);

  const viewClient = clients.find((c) => c.id === viewId) || null;
  const editClient = clients.find((c) => c.id === editId) || null;

  return (
    <div className="page wide">
      <div className="exec-head">
        <h2>Client Dashboard</h2>
        <div className="muted sm">Track products, projects and issues across all clients.</div>
      </div>

      <div className="view-tabs">
        <button className={`tab${view === 'board' ? ' on' : ''}`} onClick={() => setView('board')}>
          Board
        </button>
        <button className={`tab${view === 'projects' ? ' on' : ''}`} onClick={() => setView('projects')}>
          Projects
        </button>
      </div>

      {view === 'board' && (
        <>
          <div className="dash-summary">
        <Stat n={stats.clients} label="Clients" />
        <Stat n={stats.planning} label="Planning" tone={stats.planning ? 'blue' : ''} />
        <Stat n={stats.inProgress} label="In progress" tone={stats.inProgress ? 'amber' : ''} />
        <Stat n={stats.complete} label="Complete" tone={stats.complete ? 'green' : ''} />
      </div>

      <div className="dash-controls">
        <input
          className="dash-filter"
          placeholder="Filter clients, products, projects…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="seg">
          <button className={`seg-btn${groupBy === 'am' ? ' on' : ''}`} onClick={() => setGroupBy('am')}>
            By account manager
          </button>
          <button className={`seg-btn${groupBy === 'health' ? ' on' : ''}`} onClick={() => setGroupBy('health')}>
            By health
          </button>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="card">
          <div className="muted">
            No clients yet — add one under <b>Clients</b>.
          </div>
        </div>
      ) : columns.length === 0 ? (
        <div className="card">
          <div className="muted">No clients match “{filter}”.</div>
        </div>
      ) : (
        <div className="board">
          {columns.map((col) => (
            <div className="board-col" key={col.key}>
              <div className="board-col-head">
                <span className="bch-title">{col.key}</span>
                <span className="bch-count">{col.clients.length}</span>
              </div>
              <div className="board-col-body">
                {col.key === UNASSIGNED && groupBy === 'am' && (
                  <div className="col-hint">Assign an account manager to organise these.</div>
                )}
                {col.clients.map((c) => (
                  <ClientCard key={c.id} client={c} onOpen={() => setViewId(c.id)} onEdit={() => setEditId(c.id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {view === 'projects' && (
        <ProjectsView clients={clients} filter={filter} setFilter={setFilter} onOpen={setViewId} />
      )}

      {viewClient && (
        <ClientExpanded
          client={viewClient}
          onClose={() => setViewId(null)}
          onEdit={() => {
            setEditId(viewClient.id);
            setViewId(null);
          }}
        />
      )}
      {editClient && <ClientDetailDrawer client={editClient} onClose={() => setEditId(null)} />}
    </div>
  );
}
