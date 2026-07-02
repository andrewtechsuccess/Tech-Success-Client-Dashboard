import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useData } from '../data.jsx';
import {
  visibleProducts,
  sentimentInfo,
  externalHref,
  projectScope,
  CLIENT_LINKS,
  PRODUCT_STATUS_LABEL,
  PROJECT_STATUS_LABEL
} from '../dashboard.js';

const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso || '';
  }
};

function Sentiment({ value }) {
  const { value: v, color } = sentimentInfo(value);
  return (
    <span className="sentiment" title={`Sentiment ${v}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="sentiment-dot" style={{ background: i <= v ? color : 'var(--border)' }} />
      ))}
    </span>
  );
}

// Read-only expanded view of a client opened by clicking its card. Adds a
// timestamped notes log (append-only) and an Edit button into the edit drawer.
export default function ClientExpanded({ client, onClose, onEdit }) {
  const { reload } = useData();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const products = visibleProducts(client);
  const projects = client.projects || [];
  const notes = [...(client.noteLog || [])].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const addNote = async () => {
    const t = text.trim();
    if (!t) return;
    setSaving(true);
    try {
      await api.addNote(client.id, t);
      await reload();
      setText('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-label={client.name}>
        <div className="modal-head">
          <span className="swatch" style={{ background: client.color || '#3b82f6' }} />
          <div className="dh-main">
            <b>{client.name}</b> {client.code && <span className="code">{client.code}</span>}
            {client.planStatus && <span className="plan-pill">{client.planStatus}</span>}
          </div>
          <Sentiment value={client.sentiment} />
          <button className="btn ghost sm" onClick={onEdit}>
            Edit
          </button>
          <button className="btn ghost sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="modal-body">
          <div className="ev-meta">
            {client.accountManager && <span className="pill">AM: {client.accountManager}</span>}
          </div>

          <h4 className="ev-h">Products</h4>
          {products.length ? (
            <div className="prod-row">
              {products.map((p) => (
                <span key={p.id} className={`prod-pill ${p.status}`} title={PRODUCT_STATUS_LABEL[p.status]}>
                  {p.name}
                </span>
              ))}
            </div>
          ) : (
            <div className="muted sm">None.</div>
          )}

          <h4 className="ev-h">Projects &amp; issues</h4>
          {projects.length ? (
            <div className="ev-projects">
              {projects.map((j) => (
                <div className="ev-proj" key={j.id}>
                  <span className={`proj-status ${j.status}`}>{PROJECT_STATUS_LABEL[j.status]}</span>
                  <span className="ev-proj-title">
                    {j.title}
                    {j.type === 'issue' && <span className="proj-tag">issue</span>}
                    {projectScope(j) === 'extra' && <span className="scope-tag extra">Extra</span>}
                  </span>
                  {j.owner && <span className="muted sm nowrap">{j.owner}</span>}
                  {j.due && <span className="muted sm nowrap" title="Due date">{j.due}</span>}
                  {j.connectwiseLink && (
                    <a className="cw-btn" href={externalHref(j.connectwiseLink)} target="_blank" rel="noopener noreferrer" title="Open ConnectWise project">
                      ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="muted sm">None.</div>
          )}

          {CLIENT_LINKS.some((l) => client[l.key]) && (
            <div className="ev-links">
              {CLIENT_LINKS.filter((l) => client[l.key]).map((l) => (
                <a key={l.key} className="btn ghost sm" href={externalHref(client[l.key])} target="_blank" rel="noopener noreferrer">
                  {l.label} ↗
                </a>
              ))}
            </div>
          )}

          {client.notes && (
            <>
              <h4 className="ev-h">Details</h4>
              <div className="ev-details">{client.notes}</div>
            </>
          )}

          <h4 className="ev-h">Notes</h4>
          <div className="note-add">
            <textarea placeholder="Add a note…" value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn primary sm" onClick={addNote} disabled={saving || !text.trim()}>
              {saving ? 'Saving…' : 'Add note'}
            </button>
          </div>
          {notes.length ? (
            <div className="note-list">
              {notes.map((n) => (
                <div className="note-item" key={n.id}>
                  <div className="note-text">{n.text}</div>
                  <div className="note-meta muted sm">{fmtDate(n.createdAt)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted sm">No notes yet.</div>
          )}
        </div>
      </div>
    </>
  );
}
