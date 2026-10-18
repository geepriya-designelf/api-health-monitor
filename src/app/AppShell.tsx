import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { NiumLogo } from '../components/NiumLogo';
import { CustomerCombobox } from '../components/CustomerCombobox';
import { DownloadDataButton } from '../components/DataNotice';
import { dataset, ANCHOR_MS } from '../data/repository';
import { RANGE_LABEL, scopedRequests, serviceHealth } from '../data/selectors';
import type { TimeRange } from '../data/types';
import { useScopeContext } from './ScopeContext';
import { useTriage } from './TriageContext';
import { useTheme } from './useTheme';
import { needsTriage } from '../data/triage';

const nav: { to: string; label: string; icon: IconName; hint: string }[] = [
  { to: '/', label: 'Overview', icon: 'overview', hint: 'Health at a glance' },
  { to: '/activity', label: 'API activity', icon: 'activity', hint: 'Fix failed requests' },
  { to: '/webhooks', label: 'Webhooks', icon: 'webhook', hint: 'Customer event delivery' },
  { to: '/alerts', label: 'Alerts', icon: 'bell', hint: 'Rules and notifications' },
  { to: '/integration', label: 'Integration', icon: 'plug', hint: 'Keys, rate limits, endpoints' },
];

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const s = useScopeContext();
  const triage = useTriage();
  const { theme, toggle: toggleTheme } = useTheme();
  // Collapsed sidebar is a per-viewer preference.
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('nium-nav-collapsed') === '1'; } catch { return false; } });
  const toggleNav = () => setCollapsed((c) => { try { localStorage.setItem('nium-nav-collapsed', c ? '0' : '1'); } catch { /* ignore */ } return !c; });
  const rows = scopedRequests(s.scope);
  const openTriage = rows.filter((r) => needsTriage(r) && triage.get(r.requestId).status !== 'resolved').length;
  const critical = serviceHealth(s.scope).filter((h) => h.status === 'critical').length;
  const firing = dataset.alerts.filter((a) => a.enabled && a.state === 'triggered' && (s.customerId === 'all' || a.customerId === s.customerId)).length;
  const badges: Record<string, { n: number; tone: string; label: string } | undefined> = {
    '/': critical ? { n: critical, tone: 'error', label: `${critical} disrupted ${critical === 1 ? 'API' : 'APIs'}` } : undefined,
    '/activity': openTriage ? { n: openTriage, tone: 'warning', label: `${openTriage} ${openTriage === 1 ? 'request needs' : 'requests need'} triage` } : undefined,
    '/alerts': firing ? { n: firing, tone: 'error', label: `${firing} ${firing === 1 ? 'alert' : 'alerts'} triggered` } : undefined,
  };
  return (
    <div className={`app${collapsed ? ' is-collapsed' : ''}`}>
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className="sidebar" aria-label="Primary">
        <NiumLogo />
        <nav aria-label="Main">
          <ul className="nav-list">
            {nav.map((n) => {
              const b = badges[n.to];
              return (
                <li key={n.to}>
                  <NavLink to={n.to} end className="nav-item" aria-label={collapsed ? `${n.label}: ${n.hint}${b ? `, ${b.label}` : ''}` : undefined}>
                    <Icon name={n.icon} size={18} />
                    <span className="nav-text"><span>{n.label}</span><span className="nav-hint">{n.hint}</span></span>
                    {b && <span className={`nav-count tone-${b.tone === 'error' ? 'error' : 'neutral'}`} aria-label={b.label}>{b.n}</span>}
                    {collapsed && <span className="nav-tip" aria-hidden="true">{n.label}<small>{n.hint}{b ? ` · ${b.label}` : ''}</small></span>}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="sidebar-foot">
          <span className="demo-pill">Demo data</span>
          <p className="muted" style={{ fontSize: 11 }}>Synthetic telemetry as of {new Date(ANCHOR_MS).toISOString().slice(0, 16).replace('T', ' ')} UTC</p>
          <DownloadDataButton compact />
          <button type="button" className="collapse-btn" onClick={toggleNav} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} title={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
            <Icon name="chevronLeft" size={16} /><span className="collapse-label">Collapse</span>
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="appbar">
          <div className="appbar-title">
            <h1>{title}</h1>
            <span className="sr-only" aria-live="polite">Showing {s.customerName}, {s.environment === 'sandbox' ? 'Sandbox' : 'Production'}, last {RANGE_LABEL[s.range]}</span>
          </div>
          <div className="appbar-controls">
            <button type="button" className="btn theme-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
            </button>
            <CustomerCombobox value={s.customerId} onChange={s.setCustomerId} />
            <label className="sr-only" htmlFor="range">Time range</label>
            <select id="range" className="select" value={s.range} onChange={(e) => s.setRange(e.target.value as TimeRange)}>
              {(Object.keys(RANGE_LABEL) as TimeRange[]).map((r) => <option key={r} value={r}>Last {RANGE_LABEL[r]}</option>)}
            </select>
          </div>
        </header>
        <div className="env-tabs" role="group" aria-label="Environment">
          {(['sandbox', 'production'] as const).map((e) => {
            const enabled = s.availableEnvs.includes(e);
            return (
              <button key={e} type="button" className={`env-tab env-${e}`} aria-pressed={s.environment === e} disabled={!enabled} onClick={() => s.setEnvironment(e)}>
                <span className="env-dot" aria-hidden="true" />{e === 'sandbox' ? 'Sandbox' : 'Production'}{!enabled && <span className="muted"> · not provisioned</span>}
              </button>
            );
          })}
        </div>
        <main id="main" tabIndex={-1} className="content">{children}</main>
      </div>
    </div>
  );
}
