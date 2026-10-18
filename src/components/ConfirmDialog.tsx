import { useEffect, useRef } from 'react';

// Modal confirmation for consequential actions: focus moves in, Tab is trapped, Escape cancels, focus returns.
export function ConfirmDialog({ open, title, body, confirmLabel, tone = 'danger', onConfirm, onCancel }: {
  open: boolean; title: string; body: string; confirmLabel: string; tone?: 'danger' | 'default'; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('button')];
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <>
      <div className="drawer-backdrop" onClick={onCancel} />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="cd-title" aria-describedby="cd-body" ref={ref}>
        <h2 id="cd-title">{title}</h2>
        <p id="cd-body">{body}</p>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel} data-autofocus>Cancel</button>
          <button type="button" className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </>
  );
}
