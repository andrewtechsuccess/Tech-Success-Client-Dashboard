import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../data.jsx';
import { api } from '../api.js';
import {
  clientHealth,
  externalHref,
  visibleProducts,
  sentimentInfo,
  projectOwners,
  PRODUCT_STATUSES,
  PRODUCT_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUSES,
  PROJECT_SCOPES,
  PROJECT_SCOPE_LABEL,
  projectScope,
  PRIORITY_LABEL,
  PRIORITIES,
  PLAN_STATUSES,
  UNASSIGNED
} from '../dashboard.js';
import ClientDetailDrawer from '../components/ClientDetailDrawer.jsx';
import ClientExpanded from '../components/ClientExpanded.jsx';
import ProjectModal from '../components/ProjectModal.jsx';

// Metric tile. With onClick it renders as a button (used as the view
// navigation at the top of the dashboard); `on` marks the active view.
function Stat({ n, label, tone = '', on = false, onClick }) {
  const cls = `dash-stat${tone ? ` ${tone}` : ''}${on ? ' on' : ''}`;
  if (!onClick) {
    return (
      <div className={cls}>
        <div className="ds-num">{n}</div>
        <div className="ds-label">{label}</div>
      </div>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick} aria-pressed={on}>
      <div className="ds-num">{n}</div>
      <div className="ds-label">{label}</div>
    </button>
  );
}

// Lightweight click-to-change status menu, positioned (fixed) under the anchor
// element so it escapes the board's overflow clipping. Reuses the existing
// status-pill styles for each option. Closes on select, outside-click, Esc,
// scroll, or resize.
function QuickMenu({ menu, onSelect, onClose }) {
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

  const { kind, item, rect } = menu;
  const options = kind === 'product' ? PRODUCT_STATUSES : PROJECT_STATUSES;
  const pillCls = kind === 'product' ? 'prod-pill' : 'proj-status';
  const width = 180;
  const left = Math.min(rect.left, window.innerWidth - width - 12);
  const style = { position: 'fixed', top: rect.bottom + 6, left: Math.max(8, left), width };

  return (
    <div className="quick-menu" style={style} role="menu">
      <div className="qm-title">{kind === 'product' ? item.name : item.title}</div>
      {options.map((o) => (
        <button
          key={o.value}
          className={`qm-item${o.value === item.status ? ' on' : ''}`}
          role="menuitemradio"
          aria-checked={o.value === item.status}
          onClick={() => onSelect(o.value)}
        >
          <span className={`${pillCls} ${o.value}`}>{o.label}</span>
          {o.value === item.status && <span className="qm-check">✓</span>}
        </button>
      ))}
    </div>
  );
}

function ClientCard({ client, onOpen, onEdit, onProductMenu, onProjectMenu }) {
  const health = clientHealth(client);
  const products = visibleProducts(client);
  const projects = client.projects || [];

  return (
    <div
      className="client-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        // Only act when the card itself is focused — Enter/Space on an inner
        // button (pill, dot, Edit) bubbles here and would also open the modal.
        if (e.target !== e.currentTarget) return;
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
        <SentimentDots value={client.sentiment} />
      </div>

      {products.length > 0 ? (
        <div className="prod-row">
          {products.map((p) => (
            <button
              key={p.id}
              className={`prod-pill ${p.status} quick`}
              title={`${p.name} — ${PRODUCT_STATUS_LABEL[p.status]} · click to change status`}
              onClick={(e) => {
                e.stopPropagation();
                onProductMenu(e.currentTarget, client, p);
              }}
            >
              {p.name}
            </button>
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
              <button
                className="proj-dot-btn"
                title={`${PROJECT_STATUS_LABEL[j.status]} · click to change status`}
                onClick={(e) => {
                  e.stopPropagation();
                  onProjectMenu(e.currentTarget, client, j);
                }}
              >
                <span className="proj-dot" />
              </button>
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

// A single draggable project card used in the kanban layout. Clicking the card
// (anywhere except its buttons/links) opens the Planner-style project modal.
function KanbanCard({ row, onOpen, onEdit, onOpenProject, onDragStart, onDragEnd, dragging }) {
  return (
    <div
      className={`kan-card${dragging ? ' dragging' : ''}`}
      draggable
      title="Open project"
      onClick={(e) => {
        if (e.target.closest('a, button')) return; // inner actions keep their own behaviour
        onOpenProject(row);
      }}
      onDragStart={(e) => onDragStart(e, row)}
      onDragEnd={onDragEnd}
    >
      <div className="kan-card-top">
        <span className="kan-title">{row.title}</span>
        {row.type === 'issue' && <span className="proj-tag">issue</span>}
        {projectScope(row) === 'extra' && <span className="scope-tag extra">Extra</span>}
        <button
          className="cc-edit kan-edit"
          title="Edit project"
          draggable={false}
          onClick={(e) => {
            e.stopPropagation();
            onEdit(row.clientId);
          }}
        >
          Edit
        </button>
      </div>
      <div className="kan-client">
        <button className="link-cell" onClick={() => onOpen(row.clientId)} title="Open client">
          {row.clientName}
        </button>
        {row.clientCode && <span className="code">{row.clientCode}</span>}
      </div>
      <div className="kan-meta">
        {row.priority && <span className={`prio-pill ${row.priority}`}>{PRIORITY_LABEL[row.priority]}</span>}
        {(row.tasks || []).length > 0 && (
          <span className="kan-tasks" title="Tasks done">
            ☑ {(row.tasks || []).filter((t) => t.done).length}/{(row.tasks || []).length}
          </span>
        )}
        {row.connectwiseLink && (
          <a
            className="cw-btn"
            href={externalHref(row.connectwiseLink)}
            target="_blank"
            rel="noopener noreferrer"
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            title="Open ConnectWise project"
          >
            ↗
          </a>
        )}
      </div>
      <div className="kan-fields">
        <span className="kan-field" title="Project manager">
          <span className="kf-label">PM</span>
          <span className={`kf-val${row.owner ? '' : ' muted'}`}>{row.owner || '—'}</span>
        </span>
        <span className="kan-field" title="Due date">
          <span className="kf-label">Due</span>
          <span className={`kf-val${row.due ? '' : ' muted'}`}>{row.due || '—'}</span>
        </span>
      </div>
    </div>
  );
}

// Projects view: every project/issue across all clients, shown either as a
// kanban board (a column per pipeline status, drag cards to change status) or
// as a flat table. Filterable by project manager + free-text search.
function ProjectsView({ clients, filter, setFilter, onOpen, onEdit, onOpenProject, onMove }) {
  const q = filter.trim().toLowerCase();
  const [layout, setLayout] = useState('board'); // 'board' (kanban) | 'table'
  const [owner, setOwner] = useState('all'); // 'all' | 'none' | <name>
  const [scope, setScope] = useState('all'); // 'all' | 'in_scope' | 'extra'
  const [prio, setPrio] = useState('all'); // 'all' | <priority>
  const [status, setStatus] = useState('open'); // table only: 'open' | 'all' | <status>
  const [drag, setDrag] = useState(null); // { clientId, projectId, status }
  const [overCol, setOverCol] = useState(null); // status column being hovered

  const owners = useMemo(() => projectOwners(clients), [clients]);

  // All projects flattened, with their owning client, after the people/text
  // filters (status filtering is applied per-layout below).
  const rows = useMemo(() => {
    const out = [];
    for (const c of clients) {
      for (const j of c.projects || []) {
        out.push({ ...j, clientId: c.id, clientName: c.name, clientCode: c.code, accountManager: c.accountManager });
      }
    }
    let r = out;
    if (owner !== 'all') r = r.filter((x) => (x.owner || '').trim() === (owner === 'none' ? '' : owner));
    if (scope !== 'all') r = r.filter((x) => projectScope(x) === scope);
    if (prio !== 'all') r = r.filter((x) => (x.priority || 'medium') === prio);
    if (q) r = r.filter((x) => `${x.clientName} ${x.clientCode} ${x.accountManager} ${x.owner || ''} ${x.title}`.toLowerCase().includes(q));
    r.sort((a, b) => a.clientName.localeCompare(b.clientName) || a.title.localeCompare(b.title));
    return r;
  }, [clients, q, owner, scope, prio]);

  // Table rows additionally honour the status dropdown.
  const tableRows = useMemo(() => {
    if (status === 'all') return rows;
    if (status === 'open') return rows.filter((r) => r.status !== 'completed');
    return rows.filter((r) => r.status === status);
  }, [rows, status]);

  // Group rows into kanban columns keyed by status.
  const byStatus = useMemo(() => {
    const m = new Map(PROJECT_STATUSES.map((s) => [s.value, []]));
    for (const r of rows) (m.get(r.status) || m.get('opportunity')).push(r);
    return m;
  }, [rows]);

  const clientCount = new Set(rows.map((r) => r.clientId)).size;

  const onDragStart = (e, row) => {
    e.dataTransfer.effectAllowed = 'move';
    setDrag({ clientId: row.clientId, projectId: row.id, status: row.status });
  };
  const onDrop = (e, newStatus) => {
    e.preventDefault();
    setOverCol(null);
    const d = drag;
    setDrag(null);
    if (d && d.status !== newStatus) onMove(d.clientId, d.projectId, newStatus);
  };

  return (
    <>
      <div className="dash-controls">
        <input
          className="dash-filter"
          placeholder="Filter projects, clients…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="seg">
          <button className={`seg-btn${layout === 'board' ? ' on' : ''}`} onClick={() => setLayout('board')}>
            Board
          </button>
          <button className={`seg-btn${layout === 'table' ? ' on' : ''}`} onClick={() => setLayout('table')}>
            Table
          </button>
        </div>
        {layout === 'table' && (
          <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Open (not completed)</option>
            <option value="all">All statuses</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        )}
        <select className="filter-select" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="all">All project managers</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          <option value="none">(Unassigned)</option>
        </select>
        <select className="filter-select" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">All scopes</option>
          {PROJECT_SCOPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select className="filter-select" value={prio} onChange={(e) => setPrio(e.target.value)}>
          <option value="all">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="muted sm">
          {rows.length} {rows.length === 1 ? 'item' : 'items'} · {clientCount} client{clientCount === 1 ? '' : 's'}
        </div>
      </div>

      {layout === 'board' ? (
        rows.length === 0 ? (
          <div className="card">
            <div className="muted">No projects match the current filters.</div>
          </div>
        ) : (
          <div className="board kan-board">
            {PROJECT_STATUSES.map((s) => {
              const colRows = byStatus.get(s.value) || [];
              return (
                <div
                  className={`board-col kan-col${overCol === s.value ? ' drop-target' : ''}`}
                  key={s.value}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (overCol !== s.value) setOverCol(s.value);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(null);
                  }}
                  onDrop={(e) => onDrop(e, s.value)}
                >
                  <div className="board-col-head">
                    <span className={`proj-status ${s.value}`}>{s.label}</span>
                    <span className="bch-count">{colRows.length}</span>
                  </div>
                  <div className="board-col-body kan-body">
                    {colRows.map((r) => (
                      <KanbanCard
                        key={`${r.clientId}/${r.id}`}
                        row={r}
                        onOpen={onOpen}
                        onEdit={onEdit}
                        onOpenProject={onOpenProject}
                        onDragStart={onDragStart}
                        onDragEnd={() => {
                          setDrag(null);
                          setOverCol(null);
                        }}
                        dragging={drag && drag.projectId === r.id && drag.clientId === r.clientId}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : tableRows.length === 0 ? (
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
                <th>Scope</th>
                <th>Project manager</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Due</th>
                <th>Account manager</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={`${r.clientId}/${r.id}`}>
                  <td>
                    <button className="link-cell" onClick={() => onOpen(r.clientId)}>
                      {r.clientName}
                    </button>
                    {r.clientCode && <span className="code">{r.clientCode}</span>}
                  </td>
                  <td>
                    <button className="link-cell" onClick={() => onOpenProject(r)} title="Open project">
                      {r.title}
                    </button>
                    {r.type === 'issue' && <span className="proj-tag">issue</span>}
                  </td>
                  <td>
                    <span className={`scope-tag ${projectScope(r)}`}>{PROJECT_SCOPE_LABEL[projectScope(r)]}</span>
                  </td>
                  <td className="muted">{r.owner || '—'}</td>
                  <td>
                    <span className={`proj-status ${r.status}`}>{PROJECT_STATUS_LABEL[r.status]}</span>
                  </td>
                  <td className="muted">{PRIORITY_LABEL[r.priority] || '—'}</td>
                  <td className="muted">{r.due || '—'}</td>
                  <td className="muted">{r.accountManager || '—'}</td>
                  <td className="row-actions">
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
                    <button className="cc-edit" title="Edit project" onClick={() => onEdit(r.clientId)}>
                      Edit
                    </button>
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

// Inline sentiment dots (reused from the client card).
function SentimentDots({ value }) {
  const s = sentimentInfo(value);
  return (
    <span className="sentiment" title={`Sentiment ${s.value}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="sentiment-dot" style={{ background: i <= s.value ? s.color : 'var(--border)' }} />
      ))}
    </span>
  );
}

// Risk tier from sentiment: 1-2 = at risk, 3 = watch, 4-5 = healthy.
const riskTier = (v) => {
  const n = sentimentInfo(v).value;
  if (n <= 2) return { key: 'risk', label: 'At risk', cls: 'red' };
  if (n === 3) return { key: 'watch', label: 'Watch', cls: 'amber' };
  return { key: 'healthy', label: 'Healthy', cls: 'green' };
};

// At-risk view: every client sorted worst-sentiment-first, with tier chips and
// a toggle to include healthy clients. Surfaces accounts that need attention.
function RiskView({ clients, filter, setFilter, onOpen, onEdit }) {
  const q = filter.trim().toLowerCase();
  const [showHealthy, setShowHealthy] = useState(false);

  const rows = useMemo(() => {
    const r = clients
      .map((c) => ({ ...c, _s: sentimentInfo(c.sentiment).value, _tier: riskTier(c.sentiment) }))
      .sort((a, b) => a._s - b._s || a.name.localeCompare(b.name));
    if (q) {
      return r.filter((c) =>
        `${c.name} ${c.code} ${c.accountManager || ''} ${c.planStatus || ''}`.toLowerCase().includes(q)
      );
    }
    return r;
  }, [clients, q]);

  const counts = useMemo(() => {
    let risk = 0, watch = 0, healthy = 0;
    for (const c of rows) {
      if (c._tier.key === 'risk') risk++;
      else if (c._tier.key === 'watch') watch++;
      else healthy++;
    }
    return { risk, watch, healthy };
  }, [rows]);

  const visible = showHealthy ? rows : rows.filter((c) => c._tier.key !== 'healthy');

  return (
    <>
      <div className="dash-summary">
        <Stat n={counts.risk} label="At risk" tone={counts.risk ? 'red' : ''} />
        <Stat n={counts.watch} label="Watch" tone={counts.watch ? 'amber' : ''} />
        <Stat n={counts.healthy} label="Healthy" tone={counts.healthy ? 'green' : ''} />
      </div>

      <div className="dash-controls">
        <input
          className="dash-filter"
          placeholder="Filter clients, account managers…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <label className="check-inline">
          <input type="checkbox" checked={showHealthy} onChange={(e) => setShowHealthy(e.target.checked)} />
          Show healthy clients
        </label>
        <div className="muted sm">
          {visible.length} client{visible.length === 1 ? '' : 's'} shown
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card">
          <div className="muted">
            {rows.length === 0 ? 'No clients match the current filter.' : 'No clients need attention — all healthy. 🎉'}
          </div>
        </div>
      ) : (
        <div className="card no-pad">
          <table className="hist">
            <thead>
              <tr>
                <th>Sentiment</th>
                <th>Tier</th>
                <th>Client</th>
                <th>Account manager</th>
                <th>Plan</th>
                <th>Health</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id}>
                  <td>
                    <SentimentDots value={c.sentiment} />
                  </td>
                  <td>
                    <span className={`risk-pill ${c._tier.cls}`}>{c._tier.label}</span>
                  </td>
                  <td>
                    <button className="link-cell" onClick={() => onOpen(c.id)}>
                      {c.name}
                    </button>
                    {c.code && <span className="code">{c.code}</span>}
                  </td>
                  <td className="muted">{c.accountManager || '—'}</td>
                  <td>{c.planStatus ? <span className="plan-pill">{c.planStatus}</span> : <span className="muted">—</span>}</td>
                  <td>
                    {(() => {
                      const h = clientHealth(c);
                      return <span className={`health-dot ${h.level}`} title={h.label} />;
                    })()}
                  </td>
                  <td className="row-actions">
                    <button className="cc-edit" title="Edit client" onClick={() => onEdit(c.id)}>
                      Edit
                    </button>
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

// A simple labelled horizontal bar used in the insights view.
function Bar({ label, value, total, max, sub, tone = '' }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  const fillPct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="bar-row">
      <span className="bar-label" title={label}>{label}</span>
      <span className="bar-track">
        <span className={`bar-fill${tone ? ` ${tone}` : ''}`} style={{ width: `${fillPct}%` }} />
      </span>
      <span className="bar-val">
        {value}
        {sub !== undefined ? ` · ${sub}` : ` · ${pct}%`}
      </span>
    </div>
  );
}

// Insights view: three management roll-ups — account manager workload, plan-mix
// distribution, and standard-product rollout gaps — across all clients.
function InsightsView({ clients }) {
  // Per-account-manager workload.
  const workload = useMemo(() => {
    const m = new Map();
    const get = (k) => {
      if (!m.has(k)) m.set(k, { am: k, clients: 0, atRisk: 0, openProjects: 0, inProgress: 0 });
      return m.get(k);
    };
    for (const c of clients) {
      const w = get((c.accountManager || '').trim() || UNASSIGNED);
      w.clients++;
      if (sentimentInfo(c.sentiment).value <= 2) w.atRisk++;
      for (const p of c.projects || []) if (p.status !== 'completed') w.openProjects++;
      for (const p of c.products || []) if (p.status === 'in_progress' || p.status === 'planning') w.inProgress++;
    }
    return [...m.values()].sort((a, b) => {
      if (a.am === UNASSIGNED) return 1;
      if (b.am === UNASSIGNED) return -1;
      return b.clients - a.clients || a.am.localeCompare(b.am);
    });
  }, [clients]);
  const maxClients = Math.max(1, ...workload.map((w) => w.clients));

  // Plan-status distribution.
  const plans = useMemo(() => {
    const order = [...PLAN_STATUSES, 'No plan'];
    const counts = Object.fromEntries(order.map((p) => [p, 0]));
    for (const c of clients) counts[PLAN_STATUSES.includes(c.planStatus) ? c.planStatus : 'No plan']++;
    const max = Math.max(1, ...order.map((p) => counts[p]));
    return { rows: order.map((p) => ({ plan: p, n: counts[p] })), max };
  }, [clients]);

  // Rollout gaps across the standard (template) catalog products.
  const rollout = useMemo(() => {
    const m = new Map();
    for (const c of clients) {
      for (const p of c.products || []) {
        if (!p.template) continue;
        if (!m.has(p.name)) m.set(p.name, { name: p.name, applicable: 0, complete: 0, notStarted: 0, notNeeded: 0 });
        const r = m.get(p.name);
        if (p.status === 'not_needed') { r.notNeeded++; continue; }
        r.applicable++;
        if (p.status === 'complete') r.complete++;
        else if (p.status === 'not_started') r.notStarted++;
      }
    }
    return [...m.values()]
      .map((r) => ({ ...r, pct: r.applicable ? Math.round((r.complete / r.applicable) * 100) : 0 }))
      .sort((a, b) => a.pct - b.pct || b.notStarted - a.notStarted || a.name.localeCompare(b.name));
  }, [clients]);

  return (
    <div className="insight-stack">
      <div className="card insight-card">
        <h3>Account manager workload</h3>
        {workload.length === 0 ? (
          <div className="muted">No clients yet.</div>
        ) : (
          <table className="hist">
            <thead>
              <tr>
                <th>Account manager</th>
                <th>Clients</th>
                <th>At risk</th>
                <th>Open projects</th>
                <th>Products in progress</th>
              </tr>
            </thead>
            <tbody>
              {workload.map((w) => (
                <tr key={w.am}>
                  <td>{w.am === UNASSIGNED ? <span className="muted">{UNASSIGNED}</span> : w.am}</td>
                  <td>
                    <span className="wl-bar">
                      <span className="bar-track sm">
                        <span className="bar-fill" style={{ width: `${Math.round((w.clients / maxClients) * 100)}%` }} />
                      </span>
                      <b>{w.clients}</b>
                    </span>
                  </td>
                  <td>{w.atRisk ? <span className="risk-pill red">{w.atRisk}</span> : <span className="muted">0</span>}</td>
                  <td className="muted">{w.openProjects}</td>
                  <td className="muted">{w.inProgress}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card insight-card">
        <h3>Plan distribution</h3>
        {clients.length === 0 ? (
          <div className="muted">No clients yet.</div>
        ) : (
          plans.rows.map((r) => (
            <Bar key={r.plan} label={r.plan} value={r.n} total={clients.length} max={plans.max} />
          ))
        )}
      </div>

      <div className="card insight-card">
        <h3>Rollout gaps</h3>
        <div className="muted sm gap-sub">Standard products by completion (lowest first). “Done” counts clients where the product is complete, out of those it applies to.</div>
        {rollout.length === 0 ? (
          <div className="muted">No standard products to report.</div>
        ) : (
          <table className="hist">
            <thead>
              <tr>
                <th>Product</th>
                <th>Completion</th>
                <th>Done</th>
                <th>Not started</th>
                <th>N/A</th>
              </tr>
            </thead>
            <tbody>
              {rollout.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>
                    <span className="wl-bar">
                      <span className="bar-track sm">
                        <span
                          className={`bar-fill ${r.pct >= 75 ? 'ok' : r.pct >= 40 ? 'warn' : 'danger'}`}
                          style={{ width: `${r.pct}%` }}
                        />
                      </span>
                      <b>{r.pct}%</b>
                    </span>
                  </td>
                  <td className="muted">{r.complete}/{r.applicable}</td>
                  <td>{r.notStarted ? <span className="risk-pill amber">{r.notStarted}</span> : <span className="muted">0</span>}</td>
                  <td className="muted">{r.notNeeded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Compact A–Z table of all clients — a dense scanning layout alternative to
// the grouped board columns.
function ClientTable({ clients, onOpen, onEdit }) {
  const rows = [...clients].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="card no-pad">
      <table className="hist">
        <thead>
          <tr>
            <th>Client</th>
            <th>Account manager</th>
            <th>Plan</th>
            <th>Sentiment</th>
            <th>Health</th>
            <th>Products</th>
            <th>Open projects</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const prods = visibleProducts(c);
            const done = prods.filter((p) => p.status === 'complete').length;
            const open = (c.projects || []).filter((p) => p.status !== 'completed').length;
            const h = clientHealth(c);
            return (
              <tr key={c.id}>
                <td>
                  <button className="link-cell" onClick={() => onOpen(c.id)}>
                    {c.name}
                  </button>
                  {c.code && <span className="code">{c.code}</span>}
                </td>
                <td className="muted">{c.accountManager || '—'}</td>
                <td>{c.planStatus ? <span className="plan-pill">{c.planStatus}</span> : <span className="muted">—</span>}</td>
                <td>
                  <SentimentDots value={c.sentiment} />
                </td>
                <td>
                  <span className={`health-dot ${h.level}`} title={h.label} />
                </td>
                <td className="muted">
                  {done}/{prods.length} complete
                </td>
                <td className="muted">{open || '—'}</td>
                <td className="row-actions">
                  <button className="cc-edit" title="Edit client" onClick={() => onEdit(c.id)}>
                    Edit
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Dashboard() {
  const { clients, reload } = useData();
  const [view, setView] = useState('board'); // 'board' | 'projects'
  const [filter, setFilter] = useState('');
  const [groupBy, setGroupBy] = useState('am'); // 'am' | 'pm' | 'health' | 'plan' | 'sentiment' | 'table'
  const [viewId, setViewId] = useState(null); // expanded (read) view
  const [editId, setEditId] = useState(null); // edit drawer
  const [quickMenu, setQuickMenu] = useState(null); // inline status menu: { kind, client, item, rect }
  const [projRef, setProjRef] = useState(null); // Planner-style project modal: { clientId, projectId }

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

  // Headline metric per section for the clickable nav tiles: total clients
  // (Board), open projects (Projects), at-risk clients (At risk), and overall
  // standard-product rollout completion (Insights).
  const navMetrics = useMemo(() => {
    let openProjects = 0, atRisk = 0, applicable = 0, complete = 0;
    for (const c of clients) {
      if (sentimentInfo(c.sentiment).value <= 2) atRisk++;
      for (const p of c.projects || []) if (p.status !== 'completed') openProjects++;
      for (const p of c.products || []) {
        if (!p.template || p.status === 'not_needed') continue;
        applicable++;
        if (p.status === 'complete') complete++;
      }
    }
    return {
      clients: clients.length,
      openProjects,
      atRisk,
      rolloutPct: applicable ? Math.round((complete / applicable) * 100) : 0
    };
  }, [clients]);

  const columns = useMemo(() => {
    if (groupBy === 'table') return [];
    const groups = new Map();
    const add = (k, c) => {
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    };
    for (const c of filtered) {
      if (groupBy === 'health') add(clientHealth(c).label, c);
      else if (groupBy === 'plan') add(PLAN_STATUSES.includes(c.planStatus) ? c.planStatus : 'No plan', c);
      else if (groupBy === 'sentiment') add(riskTier(c.sentiment).label, c);
      else if (groupBy === 'pm') {
        // A client appears under every PM who owns one of its projects.
        const owners = new Set((c.projects || []).map((p) => (p.owner || '').trim()).filter(Boolean));
        if (owners.size === 0) add(UNASSIGNED, c);
        else for (const o of owners) add(o, c);
      } else add((c.accountManager || '').trim() || UNASSIGNED, c);
    }
    // Plan + sentiment use a fixed logical order; name-based groups sort
    // alphabetically with "Unassigned" last.
    let keys;
    if (groupBy === 'plan') keys = [...PLAN_STATUSES, 'No plan'].filter((k) => groups.has(k));
    else if (groupBy === 'sentiment') keys = ['At risk', 'Watch', 'Healthy'].filter((k) => groups.has(k));
    else {
      keys = [...groups.keys()].sort((a, b) => {
        if (a === UNASSIGNED) return 1;
        if (b === UNASSIGNED) return -1;
        return a.localeCompare(b);
      });
    }
    return keys.map((k) => ({ key: k, clients: groups.get(k) }));
  }, [filtered, groupBy]);

  const viewClient = clients.find((c) => c.id === viewId) || null;
  const editClient = clients.find((c) => c.id === editId) || null;
  // Resolve the project modal against live data so it survives reloads (and
  // closes itself if the project was deleted elsewhere).
  const projClient = projRef ? clients.find((c) => c.id === projRef.clientId) || null : null;
  const projItem = projClient ? (projClient.projects || []).find((p) => p.id === projRef.projectId) || null : null;

  // Move a project to a new pipeline status (kanban drag-drop). Persists the
  // owning client's whole projects array, then refreshes from the server.
  const moveProject = async (clientId, projectId, newStatus) => {
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;
    const projects = (client.projects || []).map((p) => (p.id === projectId ? { ...p, status: newStatus } : p));
    try {
      await api.updateClient(clientId, { projects });
      await reload();
    } catch (err) {
      alert(`Could not move project: ${err.message}`);
    }
  };

  // Inline product status change from a client card.
  const setProductStatus = async (clientId, productId, newStatus) => {
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;
    const products = (client.products || []).map((p) => (p.id === productId ? { ...p, status: newStatus } : p));
    try {
      await api.updateClient(clientId, { products });
      await reload();
    } catch (err) {
      alert(`Could not update product: ${err.message}`);
    }
  };

  // Open the inline status menu anchored to the clicked pill/dot.
  const openMenu = (kind) => (anchorEl, client, item) => {
    const r = anchorEl.getBoundingClientRect();
    setQuickMenu({ kind, client, item, rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right } });
  };

  const onQuickSelect = (value) => {
    if (!quickMenu) return;
    const { kind, client, item } = quickMenu;
    if (value !== item.status) {
      if (kind === 'product') setProductStatus(client.id, item.id, value);
      else moveProject(client.id, item.id, value);
    }
    setQuickMenu(null);
  };

  return (
    <div className="page wide">
      <div className="exec-head">
        <div className="muted sm">Track products, projects and issues across all clients.</div>
      </div>

      <div className="dash-summary nav-summary">
        <Stat n={navMetrics.clients} label="Clients · Board" on={view === 'board'} onClick={() => setView('board')} />
        <Stat
          n={navMetrics.openProjects}
          label="Open projects"
          tone={navMetrics.openProjects ? 'blue' : ''}
          on={view === 'projects'}
          onClick={() => setView('projects')}
        />
        <Stat
          n={navMetrics.atRisk}
          label="At risk"
          tone={navMetrics.atRisk ? 'red' : 'green'}
          on={view === 'risk'}
          onClick={() => setView('risk')}
        />
        <Stat
          n={`${navMetrics.rolloutPct}%`}
          label="Rollout · Insights"
          tone={navMetrics.rolloutPct >= 75 ? 'green' : navMetrics.rolloutPct >= 40 ? 'amber' : ''}
          on={view === 'insights'}
          onClick={() => setView('insights')}
        />
      </div>

      {view === 'board' && (
        <>
      <div className="dash-controls">
        <input
          className="dash-filter"
          placeholder="Filter clients, products, projects…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          className="filter-select"
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value)}
          title="Group / layout"
        >
          <option value="am">By account manager</option>
          <option value="pm">By project manager</option>
          <option value="health">By health</option>
          <option value="plan">By plan status</option>
          <option value="sentiment">By sentiment</option>
          <option value="table">A–Z table</option>
        </select>
      </div>

      {clients.length === 0 ? (
        <div className="card">
          <div className="muted">
            No clients yet — add one under <b>Clients</b>.
          </div>
        </div>
      ) : groupBy === 'table' ? (
        filtered.length === 0 ? (
          <div className="card">
            <div className="muted">No clients match “{filter}”.</div>
          </div>
        ) : (
          <ClientTable clients={filtered} onOpen={setViewId} onEdit={setEditId} />
        )
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
                  <ClientCard
                    key={c.id}
                    client={c}
                    onOpen={() => setViewId(c.id)}
                    onEdit={() => setEditId(c.id)}
                    onProductMenu={openMenu('product')}
                    onProjectMenu={openMenu('project')}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {view === 'projects' && (
        <ProjectsView
          clients={clients}
          filter={filter}
          setFilter={setFilter}
          onOpen={setViewId}
          onEdit={setEditId}
          onOpenProject={(row) => setProjRef({ clientId: row.clientId, projectId: row.id })}
          onMove={moveProject}
        />
      )}

      {view === 'risk' && (
        <RiskView clients={clients} filter={filter} setFilter={setFilter} onOpen={setViewId} onEdit={setEditId} />
      )}

      {view === 'insights' && <InsightsView clients={clients} />}

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

      {quickMenu && <QuickMenu menu={quickMenu} onSelect={onQuickSelect} onClose={() => setQuickMenu(null)} />}

      {projClient && projItem && (
        <ProjectModal
          client={projClient}
          project={projItem}
          onClose={() => setProjRef(null)}
          onOpenClient={(cid) => {
            setProjRef(null);
            setViewId(cid);
          }}
          onEdit={(cid) => {
            setProjRef(null);
            setEditId(cid);
          }}
        />
      )}
    </div>
  );
}
