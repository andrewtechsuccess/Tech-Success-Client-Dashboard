import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useData } from '../data.jsx';
import {
  clientRoadmap,
  BACKLOG_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  PRIORITY_LABEL
} from '../dashboard.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const fmtDay = (d) => d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const fmtMonth = (d) => d.toLocaleDateString([], { month: 'long', year: 'numeric' });
const fmtFull = (d) => d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

// "5 days overdue" / "today" / "tomorrow" / "in 12 days" — blank beyond 60 days.
function relativeLabel(date, today) {
  const days = Math.round((date - today) / DAY_MS);
  if (days < 0) return { text: `${-days} day${days === -1 ? '' : 's'} overdue`, overdue: true };
  if (days === 0) return { text: 'today' };
  if (days === 1) return { text: 'tomorrow' };
  if (days <= 60) return { text: `in ${days} days` };
  return null;
}

// One roadmap row: date, what it is, who owns it.
function RoadmapItem({ item, today }) {
  const rel = relativeLabel(item.date, today);
  return (
    <div className={`rm-item${rel?.overdue ? ' overdue' : ''}`}>
      <span className="rm-date">{fmtDay(item.date)}</span>
      {item.kind === 'task' ? (
        <>
          <span className="rm-kind prod-pill">{item.product}</span>
          <span className={`bl-pill ${item.status}`}>{BACKLOG_STATUS_LABEL[item.status]}</span>
        </>
      ) : (
        <>
          <span className="rm-kind proj-tag">{item.kind === 'issue' ? 'Issue' : 'Project'}</span>
          <span className={`proj-status ${item.status}`}>{PROJECT_STATUS_LABEL[item.status]}</span>
          {(item.priority === 'high' || item.priority === 'urgent') && (
            <span className={`prio-pill ${item.priority}`}>{PRIORITY_LABEL[item.priority]}</span>
          )}
        </>
      )}
      <span className="rm-title">{item.title}</span>
      {item.who && <span className="muted sm nowrap">{item.who}</span>}
      {rel && <span className={`rm-rel${rel.overdue ? ' danger' : ''}`}>{rel.text}</span>}
    </div>
  );
}

// Full roadmap report for one client: overdue first, then month by month.
function ClientRoadmap({ client, meta }) {
  const today = todayStart();
  const { items, undatedTasks, undatedProjects } = clientRoadmap(client, meta.templates, meta.order);

  const overdue = items.filter((it) => it.date < today);
  const upcoming = items.filter((it) => it.date >= today);
  const months = [];
  for (const it of upcoming) {
    const key = fmtMonth(it.date);
    const last = months[months.length - 1];
    if (last && last.label === key) last.items.push(it);
    else months.push({ label: key, items: [it] });
  }

  return (
    <div className="page rm-page">
      <div className="exec-head bl-head rm-head">
        <Link className="btn ghost sm rm-noprint" to="/roadmap">
          ← All clients
        </Link>
        <span className="swatch" style={{ background: client.color || '#3b82f6' }} />
        <h2>{client.name}</h2>
        {client.code && <span className="code">{client.code}</span>}
        <span className="rm-printonly muted sm">Roadmap — {fmtFull(today)}</span>
        <div className="spacer" />
        <Link className="btn ghost sm rm-noprint" to={`/backlog/${client.id}`}>
          Backlog
        </Link>
        <button className="btn ghost sm rm-noprint" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <div className="rm-summary muted sm">
        {overdue.length > 0 && <span className="rm-sum danger">{overdue.length} overdue</span>}
        <span className="rm-sum">{upcoming.length} scheduled</span>
        {upcoming.length > 0 && <span className="rm-sum">next: {fmtFull(upcoming[0].date)}</span>}
      </div>

      {items.length === 0 && (
        <div className="card settings-card">
          Nothing scheduled — set due dates on this client's <Link to={`/backlog/${client.id}`}>backlog tasks</Link> or
          projects and they'll appear here.
        </div>
      )}

      {overdue.length > 0 && (
        <div className="card bl-section rm-group">
          <div className="bl-sec-head">
            <h3 className="danger">Overdue</h3>
          </div>
          <div className="rm-list">
            {overdue.map((it, i) => (
              <RoadmapItem item={it} today={today} key={i} />
            ))}
          </div>
        </div>
      )}

      {months.map((g) => (
        <div className="card bl-section rm-group" key={g.label}>
          <div className="bl-sec-head">
            <h3>{g.label}</h3>
            <span className="muted sm">
              {g.items.length} item{g.items.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="rm-list">
            {g.items.map((it, i) => (
              <RoadmapItem item={it} today={today} key={i} />
            ))}
          </div>
        </div>
      ))}

      {(undatedTasks > 0 || undatedProjects > 0) && (
        <p className="muted sm">
          Not on the roadmap yet:{' '}
          {[
            undatedTasks > 0 ? `${undatedTasks} backlog task${undatedTasks === 1 ? '' : 's'}` : null,
            undatedProjects > 0 ? `${undatedProjects} project${undatedProjects === 1 ? '' : 's'}` : null
          ]
            .filter(Boolean)
            .join(' and ')}{' '}
          without a due date — set dates on the <Link to={`/backlog/${client.id}`}>backlog page</Link> or in the client's
          projects.
        </p>
      )}
    </div>
  );
}

// Index: every client with overdue / scheduled counts and their next dated item.
function RoadmapIndex({ clients, meta }) {
  const [q, setQ] = useState('');
  const today = todayStart();
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...clients]
      .filter((c) => !needle || c.name.toLowerCase().includes(needle) || (c.code || '').toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => {
        const { items } = clientRoadmap(c, meta.templates, meta.order);
        const overdue = items.filter((it) => it.date < today).length;
        const upcoming = items.filter((it) => it.date >= today);
        return { client: c, overdue, upcoming: upcoming.length, next: upcoming[0] || null };
      });
  }, [clients, meta, q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <div className="exec-head">
        <h2>Roadmap</h2>
      </div>
      <p className="muted sm">
        What's coming up for each client — every backlog task and project with a due date, soonest first.
      </p>
      <input className="bl-search" placeholder="Search clients…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="bl-client-list">
        {rows.map(({ client: c, overdue, upcoming, next }) => (
          <Link className="bl-client-row" to={`/roadmap/${c.id}`} key={c.id}>
            <span className="swatch" style={{ background: c.color || '#3b82f6' }} />
            <span className="bl-cname">{c.name}</span>
            {c.code && <span className="code">{c.code}</span>}
            <span className="rm-idx-meta">
              {overdue > 0 && <span className="rm-sum danger">{overdue} overdue</span>}
              {next ? (
                <span className="muted sm nowrap">
                  {upcoming} scheduled · next {fmtDay(next.date)}
                </span>
              ) : (
                <span className="muted sm nowrap">nothing scheduled</span>
              )}
            </span>
          </Link>
        ))}
        {!rows.length && <div className="muted sm">No clients match “{q}”.</div>}
      </div>
    </div>
  );
}

export default function Roadmap() {
  const { clientId } = useParams();
  const { clients, loaded } = useData();
  const [meta, setMeta] = useState(null); // { templates, order }
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [{ templates }, { products }] = await Promise.all([api.backlog(), api.catalog()]);
        setMeta({ templates, order: products });
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
        <div className="muted">Loading roadmap…</div>
      </div>
    );

  if (clientId) {
    const client = clients.find((c) => c.id === clientId);
    if (!client)
      return (
        <div className="page">
          <div className="error">Client not found.</div>
          <Link className="btn ghost sm" to="/roadmap">
            ← All clients
          </Link>
        </div>
      );
    return <ClientRoadmap client={client} meta={meta} />;
  }
  return <RoadmapIndex clients={clients} meta={meta} />;
}
