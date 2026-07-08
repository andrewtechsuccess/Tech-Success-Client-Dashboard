import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useData } from '../data.jsx';
import {
  PROJECT_STATUS_LABEL,
  PRIORITY_LABEL,
  PROJECT_SCOPE_LABEL,
  projectScope,
  externalHref
} from '../dashboard.js';

// Planner-style detail view of a single project/issue, opened from the
// projects kanban/table. Read-only info (edit via the Edit button, which opens
// the client drawer) plus an interactive task checklist: add tasks, tick them
// off, remove them. Task changes persist immediately.
export default function ProjectModal({ client, project, onClose, onOpenClient, onEdit }) {
  const { reload } = useData();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

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

  // Persist a new tasks array onto this project (the server normalizes).
  const persistTasks = async (nextTasks) => {
    setBusy(true);
    try {
      const projects = (client.projects || []).map((p) => (p.id === project.id ? { ...p, tasks: nextTasks } : p));
      await api.updateClient(client.id, { projects });
      await reload();
    } catch (e) {
      alert(`Could not update tasks: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const addTask = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    await persistTasks([...tasks, { text: t, done: false }]);
  };
  const toggleTask = (task) => persistTasks(tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
  const removeTask = (task) => persistTasks(tasks.filter((t) => t.id !== task.id));

  const info = [
    { label: 'Status', value: <span className={`proj-status ${project.status}`}>{PROJECT_STATUS_LABEL[project.status]}</span> },
    { label: 'Priority', value: <span className={`prio-pill ${project.priority}`}>{PRIORITY_LABEL[project.priority] || '—'}</span> },
    { label: 'Type', value: project.type === 'issue' ? 'Issue' : 'Project' },
    { label: 'Scope', value: <span className={`scope-tag ${scope}`}>{PROJECT_SCOPE_LABEL[scope]}</span> },
    { label: 'Project manager', value: project.owner || '—' },
    { label: 'Due date', value: project.due || '—' }
  ];

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal project-modal" role="dialog" aria-label={project.title}>
        <div className="modal-head">
          <span className="swatch" style={{ background: client.color || '#3b82f6' }} />
          <div className="dh-main">
            <b>{project.title}</b>
            {project.type === 'issue' && <span className="proj-tag">issue</span>}
            {scope === 'extra' && <span className="scope-tag extra">Extra</span>}
          </div>
          <button className="btn ghost sm" onClick={() => onEdit(client.id)} title="Edit in the client drawer">
            Edit
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
          </div>

          <div className="pm-info">
            {info.map((i) => (
              <div className="pm-info-item" key={i.label}>
                <span className="kf-label">{i.label}</span>
                <span className="pm-info-val">{i.value}</span>
              </div>
            ))}
            {project.connectwiseLink && (
              <div className="pm-info-item">
                <span className="kf-label">ConnectWise</span>
                <span className="pm-info-val">
                  <a className="btn ghost sm" href={externalHref(project.connectwiseLink)} target="_blank" rel="noopener noreferrer">
                    Open ↗
                  </a>
                </span>
              </div>
            )}
          </div>

          {project.notes && (
            <>
              <h4 className="ev-h">Notes</h4>
              <div className="ev-details">{project.notes}</div>
            </>
          )}

          <h4 className="ev-h">
            Tasks{tasks.length > 0 && <span className="muted sm pm-task-count"> {doneCount}/{tasks.length} done</span>}
          </h4>
          {tasks.length > 0 ? (
            <div className="task-list">
              {tasks.map((t) => (
                <div className={`task-item${t.done ? ' done' : ''}`} key={t.id}>
                  <label className="task-main">
                    <input type="checkbox" checked={t.done} disabled={busy} onChange={() => toggleTask(t)} />
                    <span className="task-text">{t.text}</span>
                  </label>
                  <button className="icon-btn task-del" title="Remove task" disabled={busy} onClick={() => removeTask(t)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted sm">No tasks yet — add the steps to get this done.</div>
          )}

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
