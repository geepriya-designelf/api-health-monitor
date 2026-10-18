import { useId, useMemo, useRef, useState } from 'react';
import { dataset } from '../data/repository';
import { Icon } from './Icon';

const options = dataset.customers.map((c) => ({ id: c.id, name: c.name, meta: `${c.region} · ${c.environments.length === 2 ? 'Sandbox + Production' : 'Sandbox only'}` }));

// Searchable customer picker (ARIA 1.2 combobox with listbox popup).
export function CustomerCombobox({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Pending close from blur; reopening cancels it so a quick re-click is never swallowed.
  const closeTimer = useRef<number | undefined>(undefined);
  const current = options.find((o) => o.id === value);
  const results = useMemo(() => options.filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase())), [query]);
  const choose = (oid: string) => { onChange(oid); setOpen(false); setQuery(''); };
  return (
    <div className="combo">
      <label htmlFor={id} className="sr-only">Customer</label>
      <span className="combo-icon" aria-hidden="true"><Icon name="search" size={14} /></span>
      <input id={id} ref={inputRef} className="input combo-input" role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${id}-${results[active].id}` : undefined}
        value={open ? query : current?.name ?? ''} placeholder={current?.name ?? 'Search customers'}
        onFocus={() => { window.clearTimeout(closeTimer.current); setOpen(true); setActive(0); }}
        onMouseDown={() => { window.clearTimeout(closeTimer.current); setOpen(true); }}
        onBlur={() => { closeTimer.current = window.setTimeout(() => setOpen(false), 120); }}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(results.length - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === 'Enter' && open && results[active]) { e.preventDefault(); choose(results[active].id); inputRef.current?.blur(); }
          if (e.key === 'Escape') { setOpen(false); setQuery(''); }
        }} />
      <span className="combo-caret" aria-hidden="true">▾</span>
      {open && (
        <ul id={`${id}-list`} role="listbox" className="combo-list" aria-label="Customers">
          {results.length === 0 && <li className="combo-empty" role="presentation">No customers match "{query}"</li>}
          {results.map((o, i) => (
            <li key={o.id} id={`${id}-${o.id}`} role="option" aria-selected={o.id === value} className={i === active ? 'is-active' : ''}
              onMouseDown={(e) => { e.preventDefault(); choose(o.id); }} onMouseEnter={() => setActive(i)}>
              <span>{o.name}</span><span className="muted">{o.meta}</span>
              {o.id === value && <Icon name="check" size={14} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
