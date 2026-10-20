import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { NiumLogo } from '../components/NiumLogo';
import { CustomerCombobox } from '../components/CustomerCombobox';
import { dataset } from '../data/repository';
import { RANGE_LABEL, serviceHealth } from '../data/selectors';
import type { TimeRange } from '../data/types';
import { useScopeContext } from './ScopeContext';
import { useTheme } from './useTheme';
import { useAssistant } from './AssistantContext';
import { AssistantPanel } from '../features/assistant/AssistantPanel';

const nav: { to: string; label: string; icon: IconName; hint: string }[] = [
  { to: '/', label: 'Overview', icon: 'overview', hint: 'Health at a glance' },
  { to: '/activity', label: 'API activity', icon: 'activity', hint: 'Fix failed requests' },
  { to: '/webhooks', label: 'Webhooks', icon: 'webhook', hint: 'Customer event delivery' },
  { to: '/alerts', label: 'Alerts', icon: 'bell', hint: 'Rules and notifications' },
  { to: '/integration', label: 'Integration', icon: 'plug', hint: 'Keys, rate limits, endpoints' },
];

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const s = useScopeContext();
  const { theme, toggle: toggleTheme } = useTheme();
  const assistant = useAssistant();
  // ⌘K / Ctrl+K opens the assistant from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); assistant.ask(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  // Collapsed sidebar is a per-viewer preference.
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('nium-nav-collapsed') === '1'; } catch { return false; } });
  const toggleNav = () => setCollapsed((c) => { try { localStorage.setItem('nium-nav-collapsed', c ? '0' : '1'); } catch { /* ignore */ } return !c; });
  const critical = serviceHealth(s.scope).filter((h) => h.status === 'critical').length;
  const firing = dataset.alerts.filter((a) => a.enabled && a.state === 'triggered' && (s.customerId === 'all' || a.customerId === s.customerId)).length;
  const badges: Record<string, { n: number; tone: string; label: string } | undefined> = {
    '/': critical ? { n: critical, tone: 'error', label: `${critical} critical ${critical === 1 ? 'API' : 'APIs'}` } : undefined,
    '/alerts': firing ? { n: firing, tone: 'error', label: `${firing} ${firing === 1 ? 'alert' : 'alerts'} triggered` } : undefined,
  };
  return (
    <div className={`app${collapsed ? ' is-collapsed' : ''}${assistant.open ? ' has-assistant' : ''}`}>
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className="sidebar" aria-label="Primary">
        <div className="sidebar-top">
          <NiumLogo />
          <button type="button" className="collapse-btn" onClick={toggleNav} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} title={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
            <Icon name="chevronLeft" size={16} />
          </button>
        </div>
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
          <div className="env-switch" role="group" aria-label="Environment">
            {(['sandbox', 'production'] as const).map((e) => {
              const enabled = s.availableEnvs.includes(e);
              const label = e === 'sandbox' ? 'Sandbox' : 'Production';
              return (
                <button key={e} type="button" className={`env-opt env-${e}`} aria-pressed={s.environment === e} disabled={!enabled} onClick={() => s.setEnvironment(e)}
                  aria-label={enabled ? label : `${label}, not provisioned`}>
                  <span className="env-dot" aria-hidden="true" /><span className="env-label">{label}</span><span className="env-short" aria-hidden="true">{label[0]}</span><span className="nav-tip env-tip" aria-hidden="true">{label}{!enabled && <small>Not provisioned</small>}</span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="appbar">
          <div className="appbar-title">
            <h1>{title}</h1>
            <span className="sr-only" aria-live="polite">Showing {s.customerName}, {s.environment === 'sandbox' ? 'Sandbox' : 'Production'}, last {RANGE_LABEL[s.range]}</span>
          </div>
          <div className="appbar-controls">
            <button type="button" className={`btn ask-btn${assistant.open ? ' is-on' : ''}`} onClick={() => (assistant.open ? assistant.close() : assistant.ask())} aria-expanded={assistant.open} aria-label="Ask the investigation assistant (⌘K)">
              <Icon name="sparkle" size={15} /><span>Ask</span><kbd aria-hidden="true">⌘K</kbd>
            </button>
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
        <main id="main" tabIndex={-1} className="content">{children}</main>
      </div>
      <AssistantPanel />
    </div>
  );
}
