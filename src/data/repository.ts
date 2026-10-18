// Data access boundary. Today it reads the bundled synthetic JSON fixture; swap this module
// for an authorised backend client later without touching UI components.
import raw from '../../data/nium-dashboard-mock-data.json';
import type { Dataset } from './types';

export const dataset = raw as unknown as Dataset;
export const ANCHOR_MS = Date.parse(dataset.meta.anchorTime);

export function downloadDataset() {
  const blob = new Blob([JSON.stringify(dataset, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nium-dashboard-mock-data.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
