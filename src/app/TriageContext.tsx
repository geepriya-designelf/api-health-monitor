import { createContext, useContext, useState, type ReactNode } from 'react';

export type TriageStatus = 'new' | 'investigating' | 'escalated' | 'resolved';
export interface TriageRecord { status: TriageStatus; note?: string; updatedAt: string; by?: string }
interface TriageState { get: (id: string) => TriageRecord; update: (ids: string[], patch: Partial<TriageRecord>) => void }

const KEY = 'nium-health-triage-v1';
const Ctx = createContext<TriageState | null>(null);
const load = (): Record<string, TriageRecord> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } };

// Triage state lives in this viewer's browser only (prototype convenience, not shared or audited).
export function TriageProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<Record<string, TriageRecord>>(load);
  const update = (ids: string[], patch: Partial<TriageRecord>) => setMap((cur) => {
    const next = { ...cur };
    for (const id of ids) next[id] = { ...(cur[id] ?? { status: 'new' }), ...patch, updatedAt: new Date().toISOString() } as TriageRecord;
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable: keep in memory */ }
    return next;
  });
  const get = (id: string): TriageRecord => map[id] ?? { status: 'new', updatedAt: '' };
  return <Ctx.Provider value={{ get, update }}>{children}</Ctx.Provider>;
}
export function useTriage() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTriage must be used inside TriageProvider');
  return v;
}
