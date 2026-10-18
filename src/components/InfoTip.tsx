import { useId, useState } from 'react';

// Explains a term in place: opens on hover or keyboard focus, closes on Escape or blur.
export function InfoTip({ term, children }: { term: string; children: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="infotip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label={`What is ${term}?`} aria-describedby={open ? id : undefined} aria-expanded={open}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>i</button>
      {open && <span role="tooltip" id={id}>{children}</span>}
    </span>
  );
}
