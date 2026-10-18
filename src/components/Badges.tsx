import type { HealthStatus, Outcome } from '../data/types';
import { Icon, type IconName } from './Icon';

const health: Record<HealthStatus, { label: string; icon: IconName }> = {
  healthy: { label: 'Healthy', icon: 'check' },
  degraded: { label: 'Degraded', icon: 'alert' },
  critical: { label: 'Critical', icon: 'x' },
  unknown: { label: 'Unknown', icon: 'question' },
};
// Status is always icon + text, never colour alone.
export function HealthBadge({ status, label }: { status: HealthStatus; label?: string }) {
  const h = health[status];
  return <span className={`badge tone-${status}`}><Icon name={h.icon} size={13} />{label ?? h.label}</span>;
}

export function HttpStatusBadge({ status }: { status: number }) {
  // 2xx stays quiet so exceptions stand out; 4xx and 5xx get a filled badge.
  if (status < 300) return <span className="http-ok mono" title={`HTTP ${status}`}>{status}</span>;
  const tone = status < 500 ? 'warning' : 'error';
  return <span className={`badge tone-${tone} mono`} title={`HTTP ${status}`}>{status}</span>;
}

const outcomeLabel: Record<Outcome, [string, string]> = {
  success: ['Success', 'success'], client_error: ['Client error', 'warning'], server_error: ['Server error', 'error'], timeout: ['Timeout', 'error'],
};
export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const [l, t] = outcomeLabel[outcome];
  return <span className={`badge tone-${t}`}>{l}</span>;
}

export const MethodTag = ({ method }: { method: string }) => <span className={`method method-${method}`}>{method}</span>;
export const DemoPill = ({ children = 'Synthetic telemetry' }: { children?: string }) => <span className="demo-pill">{children}</span>;
