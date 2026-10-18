import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { dataset } from '../data/repository';
import type { Environment, ServiceId, TimeRange } from '../data/types';

interface ScopeState {
  customerId: string; customerName: string; setCustomerId: (id: string) => void;
  environment: Environment; setEnvironment: (e: Environment) => void;
  range: TimeRange; setRange: (r: TimeRange) => void;
  service: ServiceId | null; setService: (s: ServiceId | null) => void;
  scope: { customerId: string; environment: Environment; range: TimeRange };
  availableEnvs: Environment[];
}
const Ctx = createContext<ScopeState | null>(null);

// One scope shared by every page, so switching pages keeps the customer, environment and range.
export function ScopeProvider({ children }: { children: ReactNode }) {
  const [customerId, setCustomerIdRaw] = useState('airbnb_demo');
  const [environment, setEnvironment] = useState<Environment>('production');
  const [range, setRange] = useState<TimeRange>('90m');
  const [service, setService] = useState<ServiceId | null>(null);
  const customer = dataset.customers.find((c) => c.id === customerId);
  const availableEnvs: Environment[] = customer?.environments ?? ['sandbox', 'production'];
  const value = useMemo<ScopeState>(() => ({
    customerId, customerName: customer?.name ?? '',
    setCustomerId: (id) => {
      setCustomerIdRaw(id); setService(null);
      const envs = dataset.customers.find((c) => c.id === id)?.environments ?? [];
      if (!envs.includes(environment)) setEnvironment(envs[0] as Environment);
    },
    environment, setEnvironment: (e) => { setEnvironment(e); setService(null); },
    range, setRange, service, setService,
    scope: { customerId, environment, range }, availableEnvs,
  }), [customerId, customer, environment, range, service, availableEnvs]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useScopeContext() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useScopeContext must be used inside ScopeProvider');
  return v;
}
