import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useData } from '../data.jsx';
import {
  PRODUCT_STATUSES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  PROJECT_SCOPES,
  PRIORITIES,
  PLAN_STATUSES,
  CLIENT_LINKS,
  accountManagers,
  staffList,
  externalHref
} from '../dashboard.js';

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`;

const newProduct = () => ({ id: uid(), name: '', status: 'not_started', note: '', template: false });
const newProject = () => ({
  id: uid(),
  title: '',
  type: 'project',
  scope: 'in_scope',
  status: 'opportunity',
  priority: 'medium',
  owner: '',
  hours: 0,
  quarter: '',
  start: '',
  end: '',
  connectwiseLink: '',
  notes: ''
});

// Slide-over editor for a single client: account manager, products, and
// projects/issues. Edits are collected locally and saved on Save changes — but
// as a DIFF against the copy this drawer opened with, one request per changed
// field/row, so untouched fields are never transmitted and can't overwrite
// what someone else changed while this drawer was open.
export default function ClientDetailDrawer({ client, onClose }) {
  const { clients, reload } = useData();
  const [am, setAm] = useState(client.accountManager || '');
  const [planStatus, setPlanStatus] = useState(client.planStatus || '');
  const [sentiment, setSentiment] = useState(client.sentiment || 3);
  const [notes, setNotes] = useState(client.notes || '');
  const [links, setLinks] = useState(() => Object.fromEntries(CLIENT_LINKS.map((l) => [l.key, client[l.key] || ''])));
  const [products, setProducts] = useState(() => (client.products || []).map((p) => ({ ...p })));
  const [projects, setProjects] = useState(() => (client.projects || []).map((p) => ({ ...p })));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  // The state this drawer opened with. Deliberately NOT the live `client`
  // prop, which the background refresh updates underneath us: diffing against
  // a moving baseline would make untouched fields look changed and send them,
  // overwriting whatever the other person just did.
  const baseline = useRef(client);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const amList = accountManagers(clients);
  const staff = staffList(clients);
  const templateProducts = products.filter((p) => p.template);
  const customProducts = products.filter((p) => !p.template);

  const setProduct = (id, patch) => setProducts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const removeProduct = (id) => setProducts((ps) => ps.filter((p) => p.id !== id));
  const addProduct = () => setProducts((ps) => [...ps, newProduct()]);

  const setProject = (id, patch) => setProjects((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  const removeProject = (id) => setProjects((js) => js.filter((j) => j.id !== id));
  const addProject = () => setProjects((js) => [...js, newProject()]);

  // Fields whose value differs from what we opened with.
  const changedFields = (before, after, keys) => {
    const patch = {};
    for (const k of keys) if ((after[k] ?? '') !== (before[k] ?? '')) patch[k] = after[k];
    return patch;
  };

  const save = async () => {
    setSaving(true);
    setErr('');
    try {
      const original = baseline.current;

      const clientPatch = changedFields(
        original,
        { accountManager: am, planStatus, sentiment, notes, ...links },
        ['accountManager', 'planStatus', 'sentiment', 'notes', ...CLIENT_LINKS.map((l) => l.key)]
      );
      if (Object.keys(clientPatch).length) await api.patchClient(client.id, clientPatch);

      // Products: added rows are POSTed, edited rows PATCHed field-by-field,
      // removed rows DELETEd. Template rows can only change status/note.
      const beforeProducts = new Map((original.products || []).map((p) => [p.id, p]));
      for (const p of products) {
        const was = beforeProducts.get(p.id);
        if (!was) {
          if (p.name.trim()) await api.addProduct(client.id, { name: p.name, status: p.status, note: p.note });
          continue;
        }
        const patch = changedFields(was, p, p.template ? ['status', 'note'] : ['name', 'status', 'note']);
        if (Object.keys(patch).length) await api.patchProduct(client.id, p.id, patch);
      }
      const keptProducts = new Set(products.map((p) => p.id));
      for (const was of beforeProducts.values()) {
        if (!keptProducts.has(was.id) && !was.template) await api.deleteProduct(client.id, was.id);
      }

      const PROJECT_KEYS = ['title', 'type', 'scope', 'status', 'priority', 'owner', 'hours', 'quarter', 'start', 'end', 'connectwiseLink', 'notes'];
      const beforeProjects = new Map((original.projects || []).map((p) => [p.id, p]));
      for (const j of projects) {
        const was = beforeProjects.get(j.id);
        if (!was) {
          if (j.title.trim()) await api.addProject(client.id, j);
          continue;
        }
        const patch = changedFields(was, j, PROJECT_KEYS);
        if (Object.keys(patch).length) await api.patchProject(client.id, j.id, patch);
      }
      const keptProjects = new Set(projects.map((p) => p.id));
      for (const was of beforeProjects.values()) {
        if (!keptProjects.has(was.id)) await api.deleteProject(client.id, was.id);
      }

      await reload();
      onClose();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`Edit ${client.name}`}>
        <div className="drawer-head">
          <span className="swatch" style={{ background: client.color || '#3b82f6' }} />
          <div className="dh-main">
            <b>{client.name}</b> {client.code && <span className="code">{client.code}</span>}
          </div>
          <button className="btn ghost sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="drawer-body">
          <div className="field">
            <label>Account manager</label>
            <input
              list="am-options"
              value={am}
              onChange={(e) => setAm(e.target.value)}
              placeholder="e.g. Andrew Porteous"
            />
            <datalist id="am-options">
              {amList.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label>Plan status</label>
            <select value={planStatus} onChange={(e) => setPlanStatus(e.target.value)}>
              <option value="">— none —</option>
              {PLAN_STATUSES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Client sentiment: {sentiment}/5</label>
            <input
              className="range"
              type="range"
              min="1"
              max="5"
              step="1"
              value={sentiment}
              onChange={(e) => setSentiment(Number(e.target.value))}
            />
          </div>

          {CLIENT_LINKS.map((l) => (
            <div className="field" key={l.key}>
              <label>{l.label} link</label>
              <input
                value={links[l.key]}
                onChange={(e) => setLinks((s) => ({ ...s, [l.key]: e.target.value }))}
                placeholder="https://…"
              />
            </div>
          ))}

          <div className="field">
            <label>Details</label>
            <textarea
              className="details-area"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Type, lead tech, scores, infrastructure notes…"
            />
          </div>

          <div className="drawer-section">
            <div className="ds-head">
              <h4>Products</h4>
              <button type="button" className="btn ghost sm" onClick={addProduct}>
                + Add custom product
              </button>
            </div>

            {templateProducts.map((p) => (
              <div className="edit-row" key={p.id}>
                <span className="prod-fixed" title="Standard product — set status only">{p.name}</span>
                <select value={p.status} onChange={(e) => setProduct(p.id, { status: e.target.value })}>
                  {PRODUCT_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            {customProducts.length > 0 && <div className="sub-label">Custom</div>}
            {customProducts.map((p) => (
              <div className="edit-row" key={p.id}>
                <input
                  className="er-grow"
                  placeholder="Custom product name"
                  value={p.name}
                  onChange={(e) => setProduct(p.id, { name: e.target.value })}
                />
                <select value={p.status} onChange={(e) => setProduct(p.id, { status: e.target.value })}>
                  {PRODUCT_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="icon-btn" title="Remove product" onClick={() => removeProduct(p.id)}>
                  ✕
                </button>
              </div>
            ))}

            {templateProducts.length === 0 && customProducts.length === 0 && (
              <div className="empty-sm">No products yet.</div>
            )}
          </div>

          <div className="drawer-section">
            <div className="ds-head">
              <h4>Projects &amp; issues</h4>
              <button type="button" className="btn ghost sm" onClick={addProject}>
                + Add item
              </button>
            </div>
            {projects.length === 0 && <div className="empty-sm">Nothing tracked yet.</div>}
            {projects.map((j) => (
              <div className="edit-card" key={j.id}>
                <div className="edit-row">
                  <input
                    className="er-grow"
                    placeholder="Title"
                    value={j.title}
                    onChange={(e) => setProject(j.id, { title: e.target.value })}
                  />
                  <button type="button" className="icon-btn" title="Remove item" onClick={() => removeProject(j.id)}>
                    ✕
                  </button>
                </div>
                <div className="edit-row wrap">
                  <select value={j.type} onChange={(e) => setProject(j.id, { type: e.target.value })}>
                    {PROJECT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <select value={j.scope || 'in_scope'} onChange={(e) => setProject(j.id, { scope: e.target.value })}>
                    {PROJECT_SCOPES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <select value={j.status} onChange={(e) => setProject(j.id, { status: e.target.value })}>
                    {PROJECT_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <select value={j.priority} onChange={(e) => setProject(j.id, { priority: e.target.value })}>
                    {PRIORITIES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="er-hours"
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder="hrs"
                    title="Estimated hours"
                    value={j.hours || ''}
                    onChange={(e) => setProject(j.id, { hours: e.target.value === '' ? 0 : Number(e.target.value) })}
                  />
                  <input
                    type="date"
                    title="Start date"
                    value={j.start || ''}
                    onChange={(e) => setProject(j.id, { start: e.target.value })}
                  />
                  <input
                    type="date"
                    title="End date"
                    value={j.end || ''}
                    onChange={(e) => setProject(j.id, { end: e.target.value })}
                  />
                </div>
                <div className="edit-row">
                  <select
                    className="er-grow"
                    value={j.owner || ''}
                    onChange={(e) => setProject(j.id, { owner: e.target.value })}
                  >
                    <option value="">— Project Manager —</option>
                    {j.owner && !staff.includes(j.owner) && <option value={j.owner}>{j.owner}</option>}
                    {staff.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="edit-row">
                  <input
                    className="er-grow"
                    placeholder="ConnectWise project link (URL)"
                    value={j.connectwiseLink || ''}
                    onChange={(e) => setProject(j.id, { connectwiseLink: e.target.value })}
                  />
                  {j.connectwiseLink && (
                    <a className="btn ghost sm" href={externalHref(j.connectwiseLink)} target="_blank" rel="noopener noreferrer">
                      Open ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {err && <div className="error">{err}</div>}
        </div>

        <div className="drawer-foot">
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </aside>
    </>
  );
}
