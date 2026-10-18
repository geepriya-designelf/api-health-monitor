export const fmtPct = (v: number | null, digits = 1) => (v == null ? '—' : `${v.toFixed(digits)}%`);
export const fmtMs = (v: number | null) => (v == null ? '—' : v >= 10000 ? `${(v / 1000).toFixed(0)} s` : `${Math.round(v).toLocaleString('en-US')} ms`);
export const fmtInt = (v: number) => v.toLocaleString('en-US');
export const fmtTime = (iso: string) => iso.slice(11, 19) + ' UTC';
export const fmtDateTime = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
export function fmtAgo(iso: string | null, anchorMs: number) {
  if (!iso) return 'never';
  const m = Math.round((anchorMs - Date.parse(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  return `${(m / 60).toFixed(1)} h ago`;
}
// Shorten long Nium paths for scanning; the full path stays available in titles and the drawer.
export const shortPath = (p: string) =>
  p.replace('/api/v1/client/{clientHashId}/customer/{customerHashId}/wallet/{walletHashId}', '…/wallet/{w}')
    .replace('/api/v2/client/{clientHashId}/customer/{customerHashId}', '…/v2/customer/{c}')
    .replace('/api/v1/client/{clientHashId}', '…/client/{c}');
