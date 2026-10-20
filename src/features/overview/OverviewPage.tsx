import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useScopeContext } from '../../app/ScopeContext';
import { HealthBadge } from '../../components/Badges';
import { Icon } from '../../components/Icon';
import { InfoTip } from '../../components/InfoTip';
import { ServicePicker } from '../../components/ServicePicker';
import { TrendChart } from '../../components/TrendChart';
import { ANCHOR_MS, dataset } from '../../data/repository';
import { RANGE_LABEL, bucketLabel, endpointBreakdown, scopedWebhooks, serviceHealth, summarizeScope, trend, webhookStatus, webhookSummary } from '../../data/selectors';
import type { HealthStatus } from '../../data/types';
import { fmtAgo, fmtInt, fmtMs, fmtPct, fmtTime } from '../../utils/format';
import { ActivityTable } from '../activity/ActivityTable';

// Status vocabulary borrowed from payment-platform status pages.
const STATUS_ICON: Record<HealthStatus, 'x' | 'alert' | 'check' | 'question'> = { critical: 'x', degraded: 'alert', healthy: 'check', unknown: 'question' };
const STATUS_WORD: Record<HealthStatus, string> = { healthy: 'Healthy', degraded: 'Degraded', critical: 'Critical', unknown: 'No data' };
const EVENT_NAME: Record<string, string> = { INITIATED: 'Payout initiated', PAID: 'Payout paid', FAILED: 'Payout failed', RETURNED: 'Payout returned' };
export const eventName = (template: string) => EVENT_NAME[template.replace('REMIT_TRANSACTION_', '').replace('_WEBHOOK', '')] ?? template;

export function OverviewPage() {
  const s = useScopeContext();
  const health = useMemo(() => serviceHealth(s.scope), [s.scope.customerId, s.scope.environment, s.scope.range]);
  const hooks = useMemo(() => scopedWebhooks(s.scope), [s.scope.customerId, s.scope.environment, s.scope.range]);
  const sum = useMemo(() => summarizeScope(s.scope), [s.scope.customerId, s.scope.environment, s.scope.range]);
  const wh = webhookSummary(s.scope);
  const whStatus = webhookStatus(wh);
  const slowest = endpointBreakdown(s.scope)[0];
  const latestFail = [...hooks].reverse().find((w) => w.deliveryStatus === 'failed');
  const period = `the last ${RANGE_LABEL[s.range]}`;

  return (
    <div className="overview">
      <section aria-label="Key metrics" className="kpis">
        <div className="kpi"><span className="kpi-label">API requests<InfoTip term="API requests">Every request this customer sent to Nium in this environment and period, whether it succeeded or not.</InfoTip></span><span className="kpi-value">{fmtInt(sum.total)}</span><span className="kpi-sub">in {period}</span></div>
        <div className="kpi"><span className="kpi-label">Response time (P95)<InfoTip term="Response time (P95)">95% of requests completed faster than this. It reflects the slow experiences that an average would hide.</InfoTip></span><span className="kpi-value">{fmtMs(sum.p95)}</span><span className="kpi-sub">Median {fmtMs(sum.p50)} · P99 {fmtMs(sum.p99)}</span></div>
        <div className="kpi">
          <span className="kpi-label">Success rate<InfoTip term="Success rate">Share of requests that returned a 2xx response. Timed-out requests count as unsuccessful because their outcome is unknown.</InfoTip></span>
          <span className="kpi-value" style={{ color: (sum.successRate ?? 100) < 95 ? 'var(--status-error)' : (sum.successRate ?? 100) < 98 ? 'var(--status-warning)' : undefined }}>{fmtPct(sum.successRate, 2)}</span>
          <span className="kpi-sub">{fmtInt(sum.total - sum.failed)} of {fmtInt(sum.total)} succeeded · {fmtInt(sum.failed)} failed</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Slowest endpoint<InfoTip term="Slowest endpoint">The endpoint with the highest P95 response time in this period. Timeouts are included, so a single 30-second timeout can put an endpoint here.</InfoTip></span>
          <span className="kpi-value kpi-text">{slowest?.endpoint.name ?? '—'}</span>
          <span className="kpi-sub">{slowest ? `P95 ${fmtMs(slowest.p95)} · ${dataset.services.find((x) => x.id === slowest.endpoint.service)?.name} API` : 'No requests in this period'}</span>
        </div>
      </section>

      <div className="band">
        <section aria-labelledby="ov-svc" className="panel">
          <div className="panel-header"><h2 id="ov-svc">Service health</h2></div>
          <ul className="svc-list">
            {health.map((h) => (
              <li key={h.service} className="svc-row">
                <span className="svc-row-name">{h.name}</span>
                <span className={`svc-row-status st-${h.status}`}><Icon name={STATUS_ICON[h.status]} size={14} />{STATUS_WORD[h.status]}</span>
                <span className="svc-row-reason">{h.cause === 'stale' ? `${h.reason} · last received ${fmtAgo(h.telemetry?.lastEventAt ?? null, ANCHOR_MS)}` : h.reason}</span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="ov-perf" className="panel">
          <div className="panel-header perf-header">
            <div>
              <h2 id="ov-perf">API Performance</h2>
              <span className="freshness">Updated {new Date(ANCHOR_MS).toISOString().slice(11, 16)} UTC · {bucketLabel(s.range)} intervals</span>
            </div>
            <ServicePicker label="Show performance for" value={s.service} onChange={s.setService}
              options={[{ id: null, name: 'All APIs' }, ...health.map((h) => ({ id: h.service, name: h.name, status: h.status, statusLabel: STATUS_WORD[h.status] }))]} />
          </div>
          <TrendChart data={trend(s.scope, s.service)} title={`API performance: response time and failed requests, ${period}`} height={170}
            targetMs={s.service ? dataset.services.find((x) => x.id === s.service)?.p95TargetMs : undefined} />
        </section>
        <section aria-labelledby="ov-wh" className="panel">
          <div className="panel-header"><h2 id="ov-wh">Webhook delivery</h2><HealthBadge status={whStatus} label={whStatus === 'unknown' ? 'No events' : undefined} /></div>
          <div className="wh-big">{fmtPct(wh.successRate)}<span>delivered</span></div>
          {wh.total > 0 && (
            <div className="meter" role="img" aria-label={`${wh.delivered} delivered, ${wh.delayed} delayed, ${wh.failed} failed`}>
              <span style={{ flexGrow: wh.delivered, background: 'var(--text-muted)' }} />
              <span style={{ flexGrow: wh.delayed, background: 'var(--status-warning-fill)' }} />
              <span style={{ flexGrow: wh.failed, background: 'var(--status-error-fill)' }} />
            </div>
          )}
          <div className="wh-split">
            <span><b>{fmtInt(wh.delivered)}</b> delivered</span>
            <span className={wh.delayed ? 'warn' : ''}><b>{fmtInt(wh.delayed)}</b> delayed</span>
            <span className={wh.failed ? 'err' : ''}><b>{fmtInt(wh.failed)}</b> failed</span>
          </div>
          {latestFail ? (
            <p className="wh-last">Last failed: <b>{eventName(latestFail.template)}</b> event at {fmtTime(latestFail.timestamp)}. The customer's endpoint returned HTTP {latestFail.responseStatus}.</p>
          ) : <p className="wh-last muted">No failed deliveries in this period.</p>}
          <Link to="/webhooks" className="link-more">View delivery log<Icon name="arrow" size={12} /></Link>
        </section>
      </div>

      <section aria-labelledby="ov-activity" className="panel activity-panel">
        <div className="panel-header">
          <h2 id="ov-activity">API activity</h2>
        </div>
        <ActivityTable key={`${s.customerId}-${s.environment}-${s.range}`} pageSize={10} />
      </section>
    </div>
  );
}
