// Small inline icon set (decorative by default; pass `label` to expose it to assistive tech).
const paths = {
  check: 'M4 10.5l3.5 3.5L16 5.5',
  alert: 'M10 3l8 14H2L10 3zm0 5v4m0 2.5v.5',
  x: 'M10 2a8 8 0 100 16 8 8 0 000-16zm-3 5l6 6m0-6l-6 6',
  question: 'M10 2a8 8 0 100 16 8 8 0 000-16zm-2.5 6a2.5 2.5 0 115 0c0 1.5-2.5 2-2.5 3.5m0 2.5v.5',
  copy: 'M7 7V4h9v9h-3M4 7h9v9H4z',
  search: 'M9 3a6 6 0 104.24 10.24L17 17M9 3a6 6 0 010 12',
  download: 'M10 3v10m-4-4l4 4 4-4M4 16h12',
  close: 'M5 5l10 10M15 5L5 15',
  arrow: 'M4 10h12m-5-5l5 5-5 5',
  sortAsc: 'M10 5l-4 5h8zM6 14h8',
  sortDesc: 'M10 15l4-5H6zM6 6h8',
  sort: 'M10 4l-3 4h6zm0 12l3-4H7z',
  bell: 'M10 3a5 5 0 00-5 5v3l-2 3h14l-2-3V8a5 5 0 00-5-5zm-2 13a2 2 0 004 0',
  clock: 'M10 2a8 8 0 100 16 8 8 0 000-16zm0 4v4l3 2',
  lock: 'M5 9h10v8H5zm2 0V6a3 3 0 016 0v3',
  overview: 'M3 3h6v6H3zm8 0h6v4h-6zm0 6h6v8h-6zM3 11h6v6H3z',
  activity: 'M2 10h3l2-5 3 10 2-6 2 3h4',
  // Standard webhook glyph (three linked nodes), drawn on a 24-unit grid.
  webhook: 'M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2M6 17l3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06M12 6l3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8',
  plug: 'M7 2v4m6-4v4M5 6h10v3a5 5 0 01-10 0zm5 8v4',
  chevron: 'M7 5l5 5-5 5',
  sun: 'M10 6.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM10 2v2m0 12v2M2 10h2m12 0h2M4.3 4.3l1.4 1.4m8.6 8.6l1.4 1.4m0-11.4l-1.4 1.4m-8.6 8.6l-1.4 1.4',
  moon: 'M16 12.5A6.5 6.5 0 017.5 4a6.5 6.5 0 108.5 8.5z',
  chevronLeft: 'M13 5l-5 5 5 5M5 4v12',
  flag: 'M5 17V3m0 1h9l-2 3 2 3H5',
  user: 'M10 10a3 3 0 100-6 3 3 0 000 6zm-6 7a6 6 0 0112 0',
};
export type IconName = keyof typeof paths;
const GRID_24: Partial<Record<IconName, true>> = { webhook: true };
export function Icon({ name, size = 16, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox={GRID_24[name] ? '0 0 24 24' : '0 0 20 20'} fill="none" stroke="currentColor" strokeWidth={GRID_24[name] ? 2 : 1.7} strokeLinecap="round" strokeLinejoin="round"
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      <path d={paths[name]} />
    </svg>
  );
}
