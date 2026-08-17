import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useData } from '../data.jsx';
import {
  PROJECT_STATUSES,
  PROJECT_TYPES,
  PROJECT_SCOPES,
  PRIORITIES,
  PROJECT_STATUS_LABEL,
  PROJECT_SCOPE_LABEL,
  PRIORITY_LABEL,
  projectScope,
  staffList,
  externalHref,
  isOverdue
} from '../dashboard.js';

// Planner-style detail view of a single project/issue, opened from the projects
// kanban/table. Two modes:
//   view (default) — the project's fields are read-only pills, but the notes
//                    and the task checklist stay editable, since those are the
//                    things you update while working.
//   edit           — every field becomes an inline control (Edit toggles it).
// Nothing is batched: dropdowns/dates save on change, text saves on blur.
export default function ProjectModal({ client, project, onClose, onOpenClient, onEdit }) {
  const { clients, save } = useData();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Local drafts for the free-text fields so typing isn't round-tripped per
  // keystroke. Reset only when a different project is opened — a reload from
  // our own save must not clobber what's being typed.
  const [draft, setDraft] = useState({});
  // Same idea for task titles, keyed by task id.
  const [taskDrafts, setTaskDrafts] = useState({});

  useEffect(() => {
    setDraft({
      title: project.title,
      connectwiseLink: project.connectwiseLink || '',
      notes: project.notes || ''
    });
    setTaskDrafts({});
    setEditing(false);
  }, [project.id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tasks = project.tasks || [];
  const doneCount = tasks.filter((t) => t.done).length;
  const scope = projectScope(project);
  const staff = staffList(clients);

  // Send only the fields that changed. Anything not in the patch is left as
  // the server has it, so this can't revert someone else's concurrent edit.
  const run = async (fn) => {
    setBusy(true);
    setErr('');
    try {
      await save(fn);
    } catch (e) {
      setErr(`Could not save: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const patchProject = (patch) => run(() => api.patchProject(client.id, project.id, patch));

  const setField = (key) => (e) => patchProject({ [key]: e.target.value });

  // Date inputs only accept YYYY-MM-DD; legacy free-text dates show as blank
  // in the picker rather than making it a controlled/uncontrolled mess.
  const dateValue = (key) => (/^\d{4}-\d{2}-\d{2}$/.test(project[key] || '') ? project[key] : '');

  // Commit a free-text field. A blank title would make the server drop the
  // project entirely, so an empty title reverts instead of saving.
  const commit = (key) => () => {
    let value = (draft[key] ?? '').trim();
    if (key === 'title' && !value) {
      setDraft((d) => ({ ...d, title: project.title }));
      return;
    }
    if (key === 'connectwiseLink') value = externalHref(value);
    setDraft((d) => ({ ...d, [key]: value }));
    if (value !== (project[key] || '')) patchProject({ [key]: value });
  };

  const onDraftKey = (key) => (e) => {
    if (e.key === 'Enter' && key !== 'notes') e.target.blur();
    if (e.key === 'Escape') {
      setDraft((d) => ({ ...d, [key]: project[key] || '' }));
      e.stopPropagation(); // revert the field; don't close the modal
      e.target.blur();
    }
  };

  // Tasks are added, ticked and removed one at a time rather than by replacing
  // the list, so two people working the same checklist don't undo each other.
  const addTask = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    await run(() => api.addTask(client.id, project.id, t));
  };
  const toggleTask = (task) => run(() => api.patchTask(client.id, project.id, task.id, { done: !task.done }));
  const removeTask = (task) => run(() => api.deleteTask(client.id, project.id, task.id));

  // Rename a task on blur. Blank reverts (an empty task would be meaningless).
  const commitTask = (task) => () => {
    const next = (taskDrafts[task.id] ?? '').trim();
    setTaskDrafts((d) => {
      const { [task.id]: _drop, ...rest } = d;
      return rest;
    });
    if (next && next !== task.text) run(() => api.patchTask(client.id, project.id, task.id, { text: next }));
  };

  // One row of the info grid — a label plus either the read-only pill or the
  // inline control, so both modes stay laid out identically. A plain function,
  // not a component: a component declared here would be a new type on every
  // render, remounting the row and stealing focus from the field being edited.
  const field = (label, view, edit) => {
    const Tag = editing ? 'label' : 'div';
    return (
      <Tag className="pm-info-item">
        <span className="kf-label">{label}</span>
        <span className="pm-info-val">{editing ? edit : view}</span>
      </Tag>
    );
  };

  const hasLink = !!project.connectwiseLink;

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal project-modal" role="dialog" aria-label={project.title}>
        <div className="modal-head">
          <span className="swatch" style={{ background: client.color || '#3b82f6' }} />
          <div className="dh-main pm-head-main">
            {editing ? (
              <input
                className="pm-title-input"
                value={draft.title ?? ''}
                disabled={busy}
                aria-label="Project title"
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                onBlur={commit('title')}
                onKeyDown={onDraftKey('title')}
              />
            ) : (
              <b>{project.title}</b>
            )}
            {project.type === 'issue' && <span className="proj-tag">issue</span>}
            {scope === 'extra' && <span className="scope-tag extra">Extra</span>}
          </div>
          {busy && <span className="muted sm pm-saving">Saving…</span>}
          <button
            className={`btn sm ${editing ? 'primary' : 'ghost'}`}
            onClick={() => setEditing((v) => !v)}
            title={editing ? 'Stop editing the project fields' : 'Edit the project fields'}
          >
            {editing ? 'Done' : 'Edit'}
          </button>
          <button className="btn ghost sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="modal-body">
          <div className="pm-client muted sm">
            <button className="link-cell" onClick={() => onOpenClient(client.id)} title="Open client">
              {client.name}
            </button>
            {client.code && <span className="code">{client.code}</span>}
            <span className="spacer" />
            <button className="btn ghost sm" onClick={() => onEdit(client.id)} title="Open the client drawer">
              Edit client
            </button>
          </div>

          <div className="pm-info">
            {field(
              'Status',
              <span className={`proj-status ${project.status}`}>{PROJECT_STATUS_LABEL[project.status]}</span>,
              <select
                className={`pm-sel proj-status ${project.status}`}
                value={project.status}
                disabled={busy}
                onChange={setField('status')}
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}

            {field(
              'Priority',
              <span className={`prio-pill ${project.priority}`}>{PRIORITY_LABEL[project.priority] || '—'}</span>,
              <select
                className={`pm-sel prio-pill ${project.priority}`}
                value={project.priority}
                disabled={busy}
                onChange={setField('priority')}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            )}

            {field(
              'Type',
              project.type === 'issue' ? 'Issue' : 'Project',
              <select className="pm-sel" value={project.type} disabled={busy} onChange={setField('type')}>
                {PROJECT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}

            {field(
              'Scope',
              <span className={`scope-tag ${scope}`}>{PROJECT_SCOPE_LABEL[scope]}</span>,
              <select className={`pm-sel scope-tag ${scope}`} value={scope} disabled={busy} onChange={setField('scope')}>
                {PROJECT_SCOPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}

            {field(
              'Project manager',
              project.owner || '—',
              <select className="pm-sel" value={project.owner || ''} disabled={busy} onChange={setField('owner')}>
                <option value="">— Unassigned —</option>
                {project.owner && !staff.includes(project.owner) && (
                  <option value={project.owner}>{project.owner}</option>
                )}
                {staff.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}

            {field(
              'Start date',
              project.start || '—',
              <input className="pm-sel" type="date" value={dateValue('start')} disabled={busy} onChange={setField('start')} />
            )}

            {field(
              'End date',
              <span className={isOverdue(project) ? 'overdue-cell' : undefined}>{project.end || '—'}</span>,
              <input className="pm-sel" type="date" value={dateValue('end')} disabled={busy} onChange={setField('end')} />
            )}
          </div>

          {(editing || hasLink) && (
            <>
              <h4 className="ev-h">ConnectWise</h4>
              <div className="pm-link-row">
                {editing && (
                  <input
                    className="er-grow"
                    placeholder="ConnectWise project link (URL)"
                    value={draft.connectwiseLink ?? ''}
                    disabled={busy}
                    onChange={(e) => setDraft((d) => ({ ...d, connectwiseLink: e.target.value }))}
                    onBlur={commit('connectwiseLink')}
                    onKeyDown={onDraftKey('connectwiseLink')}
                  />
                )}
                {hasLink && (
                  <a
                    className="btn ghost sm"
                    href={externalHref(project.connectwiseLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open ↗
                  </a>
                )}
              </div>
            </>
          )}

          <h4 className="ev-h">Notes</h4>
          <textarea
            className="details-area"
            placeholder="Background, scope, decisions…"
            value={draft.notes ?? ''}
            disabled={busy}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            onBlur={commit('notes')}
            onKeyDown={onDraftKey('notes')}
          />

          <h4 className="ev-h">
            Tasks{tasks.length > 0 && <span className="muted sm pm-task-count"> {doneCount}/{tasks.length} done</span>}
          </h4>
          {tasks.length > 0 ? (
            <div className="task-list">
              {tasks.map((t) => (
                <div className={`task-item${t.done ? ' done' : ''}`} key={t.id}>
                  <input
                    type="checkbox"
                    checked={t.done}
                    disabled={busy}
                    aria-label={`Mark "${t.text}" done`}
                    onChange={() => toggleTask(t)}
                  />
                  <input
                    className="task-edit"
                    value={taskDrafts[t.id] ?? t.text}
                    disabled={busy}
                    aria-label="Task"
                    onChange={(e) => setTaskDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                    onBlur={commitTask(t)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.target.blur();
                      if (e.key === 'Escape') {
                        setTaskDrafts((d) => {
                          const { [t.id]: _drop, ...rest } = d;
                          return rest;
                        });
                        e.stopPropagation();
                        e.target.blur();
                      }
                    }}
                  />
                  <button className="icon-btn task-del" title="Remove task" disabled={busy} onClick={() => removeTask(t)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted sm">No tasks yet — add the steps to get this done.</div>
          )}

          {err && <div className="error">{err}</div>}
          <div className="task-add">
            <input
              placeholder="Add a task…"
              value={text}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addTask();
              }}
            />
            <button className="btn primary sm" onClick={addTask} disabled={busy || !text.trim()}>
              Add
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
