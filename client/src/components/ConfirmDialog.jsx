import React, { useEffect } from 'react';

// In-app confirmation dialog. Used instead of window.confirm(), which is
// silently suppressed inside the Microsoft Teams webview (and some browsers'
// iframes) — a blocked confirm makes destructive actions appear to "do
// nothing". Renders over everything; Esc or backdrop = cancel.
export default function ConfirmDialog({ title = 'Are you sure?', message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <>
      <div className="modal-backdrop confirm-backdrop" onClick={onCancel} />
      <div className="modal confirm-dialog" role="alertdialog" aria-label={title}>
        <div className="confirm-body">
          <h3>{title}</h3>
          {message && <div className="confirm-msg">{message}</div>}
        </div>
        <div className="confirm-actions">
          <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
