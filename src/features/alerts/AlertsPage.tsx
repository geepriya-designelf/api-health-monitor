import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useScopeContext } from '../../app/ScopeContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Icon } from '../../components/Icon';
import { dataset } from '../../data/repository';
import type { AlertConfig } from '../../data/types';
import { fmtDateTime } from '../../utils/format';

const STATE: Record<AlertConfig['state'], { tone: string; label: string }> = {
  triggered: { tone: 'critical', label: 'Triggered' }, recovered: { tone: 'success', label: 'Resolved' }, ok: { tone: 'success', label: 'Normal' }, disabled: { tone: 'unknown', label: 'Off' },
};
const DEST: Record<string, string> = { slack_simulated: 'Slack', email_simulated: 'Email', pagerduty_simulated: 'PagerDuty' };
const METRIC: Record<AlertConfig['metric'], string> = { error_rate: 'Error rate', p95_latency: 'P95 latency', webhook_success_rate: 'Webhook delivery', error_count: 'Error count', payout_failures: 'Payout failures' };
const svcName = (id: string) => (id === 'all' ? 'All services' : dataset.services.find((s) => s.id === id)?.name ?? id);

// Each alert says what happened, what is affected and the next best action.
function impact(a: AlertConfig) {
  if (a.metric === 'webhook_success_rate') return { what: 'The customer may miss payout status updates', next: 'Open the webhook delivery log', to: '/webhooks' };
  if (a.metric === 'p95_latency') return { what: `Slower ${svcName(a.service)} API responses for the customer's users`, next: 'Review slow requests', to: '/activity' };
  return { what: `${svcName(a.service)} API requests are failing for this customer`, next: 'Review failed requests', to: '/activity' };
}

export function AlertsPage() {
  const s = useScopeContext();
  const [alerts, setAlerts] = useState(dataset.alerts);
  const [pending, setPending] = useState<AlertConfig | null>(null);
  const shown = alerts.filter((a) => s.customerId === 'all' || a.customerId === s.customerId)
    .sort((a, b) => Number(b.state === 'triggered') - Number(a.state === 'triggered'));
  const cust = (id: string) => dataset.customers.find((c) => c.id === id)?.name ?? id;
  const setEnabled = (id: string, enabled: boolean) => setAlerts((cur) => cur.map((a) => (a.alertId === id ? { ...a, enabled, state: enabled ? 'ok' : 'disabled' } : a)));
  return (
    <section className="panel" aria-labelledby="al-h">
      <div className="panel-header">
        <div><h2 id="al-h">Alert rules</h2><p>Triggered alerts first. Notifications are simulated in this prototype; nothing is sent.</p></div>
      </div>
      {shown.length === 0 ? <p className="empty-cell">No alert rules for this customer yet.</p> : (
        <div className="table-wrap">
          <table className="data">
            <caption className="sr-only">Alert rules, triggered first</caption>
            <thead><tr><th scope="col">State</th><th scope="col">Rule</th><th scope="col">Severity</th><th scope="col">Impact and next action</th><th scope="col">Condition</th><th scope="col">Notifies</th><th scope="col">Last fired</th><th scope="col">Enabled</th></tr></thead>
            <tbody>
              {shown.map((a) => {
                const im = impact(a);
                return (
                  <tr key={a.alertId} className={a.state === 'triggered' ? 'is-failed' : ''}>
                    <td><span className={`badge tone-${STATE[a.state].tone}`}>{a.state === 'triggered' ? <Icon name="alert" size={12} /> : a.state === 'disabled' ? <Icon name="close" size={12} /> : <Icon name="check" size={12} />}{STATE[a.state].label}</span></td>
                    <td>
                      <b>{a.name}</b><div className="muted" style={{ fontSize: 12 }}>{cust(a.customerId)} · {a.environment === 'sandbox' ? 'Sandbox' : 'Production'}</div>
                      {a.triggerCount24h >= 3 && <div className="noisy"><Icon name="bell" size={12} />Triggered {a.triggerCount24h} times in 24 hours. Consider adjusting the threshold to reduce noise.</div>}
                    </td>
                    <td><span className={`badge tone-${a.severity === 'critical' ? 'critical' : a.severity === 'warning' ? 'warning' : 'info'}`}>{a.severity}</span></td>
                    <td className="alert-impact">{im.what}<br /><Link to={im.to}>{im.next} →</Link></td>
                    <td className="mono" style={{ fontSize: 12 }}>{METRIC[a.metric]} {a.comparator} {a.threshold}{a.unit === '%' ? '%' : ` ${a.unit}`}<div className="muted">over {a.evaluationWindowMin} min</div></td>
                    <td>{DEST[a.destination] ?? a.destination} <span className="muted">(simulated)</span></td>
                    <td className="secondary">{a.lastTriggeredAt ? fmtDateTime(a.lastTriggeredAt) : 'Never'}</td>
                    <td>
                      <button type="button" role="switch" aria-checked={a.enabled} className={`switch${a.enabled ? ' on' : ''}`} aria-label={`${a.name} enabled`}
                        onClick={() => (a.enabled && a.severity !== 'info' ? setPending(a) : setEnabled(a.alertId, !a.enabled))}>
                        <span aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog open={!!pending} title={`Disable "${pending?.name}"?`}
        body={`This is a ${pending?.severity} alert. While it is off, no one will be notified if the ${pending ? svcName(pending.service) : ''} API degrades for ${pending ? cust(pending.customerId) : ''}. You can turn it back on at any time.`}
        confirmLabel="Disable alert" onCancel={() => setPending(null)} onConfirm={() => { if (pending) setEnabled(pending.alertId, false); setPending(null); }} />
    </section>
  );
}
