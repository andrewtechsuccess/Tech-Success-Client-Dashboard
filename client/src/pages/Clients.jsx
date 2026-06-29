import React, { useState } from 'react';
import { api } from '../api.js';
import { useData } from '../data.jsx';

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'];
const BLANK = { name: '', code: '', notes: '', color: '#3b82f6' };

export default function Clients() {
  const { clients, reload } = useData();
  const [form, setForm] = useState(BLANK);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      if (editing) await api.updateClient(editing, form);
      else await api.createClient(form);
      setForm(BLANK);
      setEditing(null);
      await reload();
    } catch (e) {
      setErr(e.message);
    }
  };

  const edit = (c) => {
    setEditing(c.id);
    setForm({ name: c.name, code: c.code, notes: c.notes || '', color: c.color || '#3b82f6' });
  };
  const cancel = () => {
    setEditing(null);
    setForm(BLANK);
  };
  const del = async (c) => {
    if (!window.confirm(`Delete client "${c.name}"? Its scripts on disk are kept.`)) return;
    await api.deleteClient(c.id);
    if (editing === c.id) cancel();
    await reload();
  };

  return (
    <div className="page">
      <div className="exec-head">
        <h2>Clients</h2>
      </div>

      <div className="two-col">
        <form className="card" onSubmit={submit}>
          <h3>{editing ? 'Edit client' : 'Add client'}</h3>
          <div className="field">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="field">
            <label>Short code {editing && <span className="muted sm">(fixed after creation)</span>}</label>
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="ACME"
              required
              disabled={!!editing}
            />
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="field">
            <label>Colour tag</label>
            <div className="swatches">
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`swatch-btn${form.color === c ? ' on' : ''}`}
                  style={{ background: c }}
                  onClick={() => setForm({ ...form, color: c })}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          {err && <div className="error">{err}</div>}
          <div className="actions">
            <button className="btn primary">{editing ? 'Save changes' : 'Add client'}</button>
            {editing && (
              <button type="button" className="btn ghost" onClick={cancel}>
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="card">
          <h3>{clients.length} client{clients.length === 1 ? '' : 's'}</h3>
          <div className="client-table">
            {clients.map((c) => (
              <div className="client-row" key={c.id}>
                <span className="swatch" style={{ background: c.color }} />
                <div className="cr-main">
                  <div>
                    <b>{c.name}</b> <span className="code">{c.code}</span>
                  </div>
                  {c.notes && <div className="muted sm">{c.notes}</div>}
                </div>
                <button className="btn ghost sm" onClick={() => edit(c)}>
                  Edit
                </button>
                <button className="btn ghost sm danger" onClick={() => del(c)}>
                  Delete
                </button>
              </div>
            ))}
            {clients.length === 0 && <div className="muted">No clients yet — add your first one.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
