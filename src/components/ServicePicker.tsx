import { useEffect, useRef, useState } from 'react';
import type { HealthStatus, ServiceId } from '../data/types';

export interface ServiceOption { id: ServiceId | null; name: string; status?: HealthStatus; statusLabel?: string }

// Listbox-style picker so each option can carry its health dot and status word (a native select can't).
export function ServicePicker({ value, options, onChange, label }: { value: ServiceId | null; options: ServiceOption[]; onChange: (id: ServiceId | null) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const pick = (o: ServiceOption) => { onChange(o.id); setOpen(false); btn.current?.focus(); };
  const show = () => { setActive(Math.max(0, options.indexOf(current))); setOpen(true); };
  const onKey = (e: React.KeyboardEvent) => {
    if (!open) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); } return; }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(options[active]); }
    else if (e.key === 'Tab') setOpen(false);
  };
  const dot = (o: ServiceOption) => <span className={`dot dot-${o.status ?? 'none'}`} aria-hidden="true" />;

  return (
    <div className="svc-picker" ref={wrap}>
      <button ref={btn} type="button" className="svc-picker-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${current.name}`}
        aria-activedescendant={open ? `svc-opt-${active}` : undefined} aria-controls="svc-picker-list"
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={onKey}>
        {dot(current)}<span>{current.name}</span><span className="svc-picker-chev" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul id="svc-picker-list" role="listbox" aria-label={label} className="svc-picker-list">
          {options.map((o, i) => (
            <li key={o.id ?? 'all'} id={`svc-opt-${i}`} role="option" aria-selected={o.id === value}
              className={`${i === active ? 'is-active' : ''}${o.id === value ? ' is-selected' : ''}`}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(o); }}>
              {dot(o)}<span>{o.name}</span>{o.statusLabel && <small className={`st-${o.status}`}>{o.statusLabel}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
