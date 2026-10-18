import { useMemo, useState } from 'react';
import { useScopeContext } from '../../app/ScopeContext';
import { HealthBadge } from '../../components/Badges';
import { dataset } from '../../data/repository';
import { scopedWebhooks, webhookStatus, webhookSummary } from '../../data/selectors';
import { fmtDateTime, fmtInt, fmtMs, fmtPct } from '../../utils/format';

type F = 'all' | 'problems';
export function WebhooksPage() {
  const s = useScopeContext();
  const hooks = useMemo(() => scopedWebhooks(s.scope), [s.scope.customerId, s.scope.environment, s.scope.range]);
  const [f, setF] = useState<F>('problems');
  const sum = webhookSummary(s.scope);
  const shown = [...hooks].reverse().filter((w) => f === 'all' || w.deliveryStatus !== 'delivered');
  const cust = (id: string) => dataset.customers.find((c) => c.id === id)?.name ?? id;
  return (
    <div className="stack">
      <section className="kpis" aria-label="Webhook summary">
        <div className="kpi"><span className="kpi-label">Delivered on time</span><span className="kpi-value">{fmtPct(sum.successRate)}</span><span className="kpi-sub"><HealthBadge status={webhookStatus(sum)} /></span></div>
        <div className="kpi"><span className="kpi-label">Delivered</span><span className="kpi-value">{fmtInt(sum.delivered)}</span><span className="kpi-sub">on the first attempt or a quick retry</span></div>
        <div className="kpi"><span className="kpi-label">Delayed</span><span className="kpi-value" style={{ color: sum.delayed ? 'var(--status-warning)' : undefined }}>{sum.delayed}</span><span className="kpi-sub">delivered after retries</span></div>
        <div className="kpi"><span className="kpi-label">Failed</span><span className="kpi-value" style={{ color: sum.failed ? 'var(--status-error)' : undefined }}>{sum.failed}</span><span className="kpi-sub">not delivered after all retries</span></div>
      </section>
      <section className="panel" aria-labelledby="wh-log">
        <div className="panel-header">
          <h2 id="wh-log">Delivery log</h2>
          <div role="group" aria-label="Filter deliveries" className="chips">
            <button type="button" className="chip" aria-pressed={f === 'problems'} onClick={() => setF('problems')}>Failed or delayed <span className="count">{sum.failed + sum.delayed}</span></button>
            <button type="button" className="chip" aria-pressed={f === 'all'} onClick={() => setF('all')}>Include delivered sample <span className="count">{hooks.length}</span></button>
          </div>
        </div>
        <div className="table-wrap" style={{ maxHeight: '60vh' }} tabIndex={0} role="region" aria-label="Webhook delivery log, scrollable">
          <table className="data">
            <caption className="sr-only">Webhook deliveries, newest first</caption>
            <thead><tr><th scope="col">Time</th><th scope="col">Event</th><th scope="col">Customer</th><th scope="col">Endpoint host</th><th scope="col">Status</th><th scope="col" className="num">Attempts</th><th scope="col" className="num">Delivery time</th><th scope="col">Payout ref</th></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={8} className="empty-cell">{hooks.length ? 'No failed or delayed deliveries in this range.' : 'No webhook events in this range.'}</td></tr>}
              {shown.slice(0, 100).map((w) => (
                <tr key={w.webhookId} className={w.deliveryStatus === 'failed' ? 'is-failed' : ''}>
                  <td className="mono">{fmtDateTime(w.timestamp)}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{w.template}</td>
                  <td>{cust(w.customerId)}</td>
                  <td className="mono secondary" style={{ fontSize: 12 }}>{w.customerEndpointHost}</td>
                  <td><span className={`badge tone-${w.deliveryStatus === 'delivered' ? 'success' : w.deliveryStatus === 'delayed' ? 'warning' : 'error'}`}>{w.deliveryStatus}{w.deliveryStatus === 'failed' ? ` · HTTP ${w.responseStatus}` : ''}</span></td>
                  <td className="num">{w.attempts}</td>
                  <td className="num">{w.deliveryLatencyMs == null ? '—' : fmtMs(w.deliveryLatencyMs)}</td>
                  <td className="mono secondary" style={{ fontSize: 12 }}>{w.systemReferenceNumber}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Totals include every delivery. The log keeps every failed or delayed delivery, plus a 1% sample of delivered ones. Event names ending in FAILED and RETURNED follow Nium's naming but weren't verified against the docs. Retry counts are illustrative.</p>
      </section>
    </div>
  );
}
