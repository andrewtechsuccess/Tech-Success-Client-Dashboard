import React, { useEffect, useMemo, useRef, useState } from 'react';
import StickyHScroll from './StickyHScroll.jsx';
import {
  PROJECT_STATUS_LABEL,
  PRIORITY_LABEL,
  projectScope,
  projectHours,
  fmtHours,
  projectSpan,
  isOverdue,
  futureQuarters,
  quarterLabel,
  startOfDay,
  addDays,
  diffDays,
  today as todayDate
} from '../dashboard.js';

// Timeline chart of the filtered projects, grouped by client. Rows come in
// already filtered by ProjectsView, so this component only owns the time axis:
// how wide a day is, where the bands break, and where each bar sits.
//
// Layout is a single horizontally-scrolling grid. The label column is
// position:sticky so it stays put while the timeline scrolls under it.

const ZOOMS = [
  { value: 'weeks', label: 'Weeks', px: 20, top: 'month', tick: 'week', snap: 'month' },
  { value: 'months', label: 'Months', px: 6, top: 'quarter', tick: 'month', snap: 'quarter' },
  { value: 'quarters', label: 'Quarters', px: 2.2, top: 'year', tick: 'quarter', snap: 'year' }
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const startOfQuarter = (d) => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
const startOfYear = (d) => new Date(d.getFullYear(), 0, 1);
// Weeks start Monday.
const startOfWeek = (d) => {
  const x = startOfDay(d);
  return addDays(x, -((x.getDay() + 6) % 7));
};
const nextMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1);
const nextQuarter = (d) => new Date(d.getFullYear(), d.getMonth() + 3, 1);
const nextYear = (d) => new Date(d.getFullYear() + 1, 0, 1);
const nextWeek = (d) => addDays(d, 7);

const quarterOf = (d) => Math.floor(d.getMonth() / 3) + 1;
const fmtDate = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const fmtStored = (s) => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? new Date(`${s}T00:00:00`) : null;
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : s || '—';
};

// The four band flavours: where a segment starts, where the next one starts,
// and what it's called.
const BANDS = {
  week: { startOf: startOfWeek, next: nextWeek, label: fmtDate },
  month: { startOf: startOfMonth, next: nextMonth, label: (d) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}` },
  quarter: { startOf: startOfQuarter, next: nextQuarter, label: (d) => `Q${quarterOf(d)} ${d.getFullYear()}` },
  year: { startOf: startOfYear, next: nextYear, label: (d) => String(d.getFullYear()) }
};
// Tick labels are narrower than band labels, so they drop the year.
const TICK_LABEL = {
  week: fmtDate,
  month: (d) => MONTHS[d.getMonth()],
  quarter: (d) => `Q${quarterOf(d)}`,
  year: (d) => String(d.getFullYear())
};

// Walk a band across the range, returning one segment per period.
function segments(kind, from, to, labelFn) {
  const { startOf, next, label } = BANDS[kind];
  const out = [];
  let cur = startOf(from);
  let guard = 0;
  while (cur <= to && guard++ < 2000) {
    const end = next(cur);
    out.push({ key: +cur, from: cur, to: end, label: (labelFn || label)(cur) });
    cur = end;
  }
  return out;
}

export default function GanttChart({ rows, onOpenProject, onOpenClient, onSetQuarter }) {
  const [zoom, setZoom] = useState('weeks');
  const [pendingQuarter, setPendingQuarter] = useState(''); // row id being saved
  const quarters = useMemo(() => futureQuarters(8), []);
  const scrollRef = useRef(null);
  const z = ZOOMS.find((x) => x.value === zoom) || ZOOMS[0];

  const dated = useMemo(
    () => rows.map((r) => ({ ...r, span: projectSpan(r) })).filter((r) => r.span),
    [rows]
  );
  const undated = useMemo(() => rows.filter((r) => !projectSpan(r)), [rows]);

  // Time axis: cover every bar plus today, pad a little, then snap outward to
  // whole months/quarters/years so the bands start and end cleanly.
  const range = useMemo(() => {
    const now = todayDate();
    let min = now;
    let max = now;
    for (const r of dated) {
      if (r.span.from < min) min = r.span.from;
      if (r.span.to > max) max = r.span.to;
    }
    min = addDays(min, -10);
    max = addDays(max, 10);
    const snap = BANDS[z.snap];
    return { from: snap.startOf(min), to: snap.next(snap.startOf(max)) };
  }, [dated, z.snap]);

  const totalDays = Math.max(1, diffDays(range.from, range.to));
  const width = Math.round(totalDays * z.px);
  const x = (d) => Math.round(diffDays(range.from, d) * z.px);
  // Clip a segment to the chart so the last band can't add phantom scroll.
  const clip = (seg) => {
    const left = Math.max(0, x(seg.from));
    return { left, width: Math.max(0, Math.min(width, x(seg.to)) - left) };
  };

  const topBands = useMemo(() => segments(z.top, range.from, range.to), [z.top, range]);
  const tickBands = useMemo(
    () => segments(z.tick, range.from, range.to, TICK_LABEL[z.tick]),
    [z.tick, range]
  );

  // One row per project, grouped under its client.
  const groups = useMemo(() => {
    const m = new Map();
    for (const r of dated) {
      if (!m.has(r.clientId)) m.set(r.clientId, { id: r.clientId, name: r.clientName, code: r.clientCode, rows: [] });
      m.get(r.clientId).rows.push(r);
    }
    for (const g of m.values()) {
      g.rows.sort((a, b) => a.span.from - b.span.from || a.title.localeCompare(b.title));
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [dated]);

  const now = todayDate();
  const todayX = x(now);

  // Put today a third of the way in, so there's history behind and runway ahead.
  const scrollToToday = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, todayX - el.clientWidth / 3);
  };
  useEffect(scrollToToday, [zoom, +range.from, groups.length]);

  if (rows.length === 0) {
    return (
      <div className="card">
        <div className="muted">No projects match the current filters.</div>
      </div>
    );
  }

  return (
    <>
      <div className="gantt-toolbar">
        <div className="seg">
          {ZOOMS.map((o) => (
            <button
              key={o.value}
              className={`seg-btn${zoom === o.value ? ' on' : ''}`}
              onClick={() => setZoom(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button className="btn ghost sm" onClick={scrollToToday}>
          Jump to today
        </button>
        <div className="muted sm">
          {dated.length} scheduled
          {undated.length > 0 && ` · ${undated.length} without dates`}
        </div>
        <div className="spacer" />
        <div className="g-legend">
          {['opportunity', 'sow', 'approved', 'in_progress', 'completed'].map((s) => (
            <span className="g-legend-item" key={s}>
              <i className={`g-swatch ${s}`} />
              {PROJECT_STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      </div>

      {dated.length === 0 ? (
        <div className="card">
          <div className="muted">
            None of these projects have dates yet — set a start or end date on a project and it'll appear here.
          </div>
        </div>
      ) : (
        <StickyHScroll className="gantt-wrap" contentRef={scrollRef}>
          <div className="gantt" style={{ '--tl-w': `${width}px` }}>
            {/* Grid lines + today marker, behind the rows and spanning them all. */}
            <div className="g-underlay">
              {topBands.map((b) => {
                const c = clip(b);
                return <i className="g-gridline" key={b.key} style={{ left: c.left }} />;
              })}
              {todayX >= 0 && todayX <= width && <i className="g-today" style={{ left: todayX }} title="Today" />}
            </div>

            <div className="g-head">
              <div className="g-label g-head-label">Project</div>
              <div className="g-time">
                <div className="g-band">
                  {topBands.map((b) => {
                    const c = clip(b);
                    return (
                      <div className="g-band-cell" key={b.key} style={{ left: c.left, width: c.width }}>
                        {c.width > 46 && b.label}
                      </div>
                    );
                  })}
                </div>
                <div className="g-band g-band-tick">
                  {tickBands.map((b) => {
                    const c = clip(b);
                    return (
                      <div className="g-band-cell" key={b.key} style={{ left: c.left, width: c.width }}>
                        {c.width > 28 && b.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {groups.map((g) => (
              <React.Fragment key={g.id}>
                <div className="g-row g-group">
                  <div className="g-label">
                    <button className="link-cell" onClick={() => onOpenClient(g.id)} title="Open client">
                      {g.name}
                    </button>
                    {g.code && <span className="code">{g.code}</span>}
                  </div>
                  <div className="g-time" />
                </div>

                {g.rows.map((r) => {
                  const left = x(r.span.from);
                  const w = Math.max(6, x(addDays(r.span.to, 1)) - left);
                  const tasks = r.tasks || [];
                  const done = tasks.filter((t) => t.done).length;
                  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
                  const overdue = isOverdue(r);
                  const tip = [
                    r.title,
                    r.span.tentative
                      ? `Tentative — targeting ${quarterLabel(r.quarter)}`
                      : `${fmtStored(r.start) === '—' ? 'No start' : fmtStored(r.start)} → ${fmtStored(r.end)}`,
                    `${PROJECT_STATUS_LABEL[r.status]} · ${PRIORITY_LABEL[r.priority] || 'No priority'}`,
                    r.owner ? `PM: ${r.owner}` : 'Unassigned',
                    projectHours(r) ? `Estimate: ${fmtHours(projectHours(r))}` : null,
                    tasks.length ? `Tasks: ${done}/${tasks.length}` : null,
                    overdue ? 'Overdue' : null
                  ]
                    .filter(Boolean)
                    .join('\n');

                  return (
                    <div className="g-row" key={`${r.clientId}/${r.id}`}>
                      <div className="g-label g-row-label">
                        <button className="link-cell g-title" onClick={() => onOpenProject(r)} title="Open project">
                          {r.title}
                        </button>
                        {r.type === 'issue' && <span className="proj-tag">issue</span>}
                        {projectScope(r) === 'extra' && <span className="scope-tag extra">Extra</span>}
                      </div>
                      <div className="g-time">
                        <button
                          className={`g-bar ${r.status}${overdue ? ' overdue' : ''}${r.span.tentative ? ' tentative' : ''}`}
                          style={{ left, width: w }}
                          title={tip}
                          onClick={() => onOpenProject(r)}
                        >
                          {pct > 0 && <span className="g-bar-fill" style={{ width: `${pct}%` }} />}
                          {w > 110 && (
                            <span className="g-bar-text">
                              {r.span.tentative
                                ? `${quarterLabel(r.quarter)} · tentative`
                                : r.span.days === 1
                                  ? fmtDate(r.span.from)
                                  : `${fmtDate(r.span.from)} – ${fmtDate(r.span.to)}`}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </StickyHScroll>
      )}

      {undated.length > 0 && (
        <div className="card g-undated">
          <h4 className="ev-h">Not scheduled ({undated.length})</h4>
          <div className="muted sm">
            These match your filters but have no dates, so they can't be plotted. Pick a target quarter to place one
            roughly — it'll appear as a tentative bar across that quarter until real dates are set.
          </div>
          <div className="g-undated-list">
            {undated.map((r) => (
              <div className="g-undated-item" key={`${r.clientId}/${r.id}`}>
                <button className="g-undated-open" onClick={() => onOpenProject(r)} title="Open project">
                  <span className={`proj-status ${r.status}`}>{PROJECT_STATUS_LABEL[r.status]}</span>
                  <span className="g-undated-title">{r.title}</span>
                  <span className="muted sm">{r.clientName}</span>
                </button>
                <select
                  className="g-quarter-select"
                  aria-label={`Target quarter for ${r.title}`}
                  title="Place this in a quarter"
                  value={r.quarter || ''}
                  disabled={pendingQuarter === r.id || !onSetQuarter}
                  onChange={async (e) => {
                    setPendingQuarter(r.id);
                    try {
                      await onSetQuarter(r, e.target.value);
                    } finally {
                      setPendingQuarter('');
                    }
                  }}
                >
                  <option value="">— target quarter —</option>
                  {quarters.map((q) => (
                    <option key={q.value} value={q.value}>
                      {q.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
