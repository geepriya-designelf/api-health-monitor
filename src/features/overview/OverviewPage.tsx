import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useScopeContext } from '../../app/ScopeContext';
import { HealthBadge } from '../../components/Badges';
import { Icon } from '../../components/Icon';
import { InfoTip } from '../../components/InfoTip';
import { TrendChart } from '../../components/TrendChart';
import { ANCHOR_MS, dataset } from '../../data/repository';
import { RANGE_LABEL, bucketLabel, endpointBreakdown, overallStatus, scopedWebhooks, serviceHealth, summarizeScope, trend, webhookStatus, webhookSummary } from '../../data/selectors';
import type { HealthStatus } from '../../data/types';
import type { HealthCause, ServiceHealth } from '../../data/selectors';
import { fmtAgo, fmtInt, fmtMs, fmtPct, fmtTime } from '../../utils/format';
import { ActivityTable } from '../activity/ActivityTable';

const VERDICT_ICON: Record<HealthStatus, 'x' | 'alert' | 'check' | 'question'> = { critical: 'x', degraded: 'alert', healthy: 'check', unknown: 'question' };
// Status vocabulary borrowed from payment-platform status pages.
const STATUS_WORD: Record<HealthStatus, string> = { healthy: 'Healthy', degraded: 'Degraded', critical: 'Critical', unknown: 'No data' };
const EVENT_NAME: Record<string, string> = { INITIATED: 'Payout initiated', PAID: 'Payout paid', FAILED: 'Payout failed', RETURNED: 'Payout returned' };
export const eventName = (template: string) => EVENT_NAME[template.replace('REMIT_TRANSACTION_', '').replace('_WEBHOOK', '')] ?? template;
const ACTION: Record<HealthCause, string> = { failures: 'Review failed', latency: 'Review slow', rejections: 'Review rejected', no_data: 'Review', stale: 'Review', no_traffic: 'Review', none: 'Review' };

export function OverviewPage() {
  const s = useScopeContext();
  const health = useMemo(() => serviceHealth(s.scope), [s.scope.customerId, s.scope.environment, s.scope.range]);
  const hooks = useMemo(() => scopedWebhooks(s.scope), [s.scope.customerId, s.scope.environment, s.scope.range]);
  const sum = useMemo(() => summarizeScope(s.scope), [s.scope.customerId, s.scope.environment, s.scope.range]);
  const wh = webhookSummary(s.scope);
  const whStatus = webhookStatus(wh);
  const slowest = endpointBreakdown(s.scope)[0];
  const status = overallStatus(health);
  const flagged = health.filter((h) => h.status === 'critical' || h.status === 'degraded')
    .sort((a, b) => Number(b.status === 'critical') - Number(a.status === 'critical'));
  const lead = flagged[0];
  const others = flagged.slice(1);
  const latestFail = [...hooks].reverse().find((w) => w.deliveryStatus === 'failed');
  const period = `the last ${RANGE_LABEL[s.range]}`;
  // One sentence that says what is wrong, how big it is, and against what.
  const detail = (h: ServiceHealth) => {
    const { total, failed, p95, serverErrors, timeouts, serverSideRate } = h.summary;
    const share = `${fmtInt(failed)} of ${fmtInt(total)} ${h.name} API requests failed in ${period}`;
    if (h.cause === 'failures') return `${fmtInt(serverErrors + timeouts)} of ${fmtInt(total)} ${h.name} API requests failed in ${period} (${fmtPct(serverSideRate)}) on server errors and timeouts.`;
    if (h.cause === 'rejections') return `${share}, most rejected as invalid (4xx). This usually points to the customer's request payloads.`;
    if (h.cause === 'latency') return `Responses are ${(p95 ?? 0) >= h.p95TargetMs * 2 ? 'more than twice as slow as' : 'slower than'} target: P95 ${fmtMs(p95)} against ${h.p95TargetMs} ms. ${failed ? `${share}.` : `No failed requests in ${period}.`}`;
    return h.reason;
  };

  return (
    <div className="overview">
      <section className={`verdict v-${status}`} aria-label="Service health summary">
        <span className="verdict-icon" aria-hidden="true"><Icon name={VERDICT_ICON[status]} size={20} /></span>
        <div className="verdict-body" role="status">
          <p className="verdict-eyebrow">Service health {STATUS_WORD[status].toLowerCase()}</p>
          <h2 className="verdict-title">
            {sum.total === 0 ? 'No API traffic in this period'
              : lead ? `${lead.name} API is ${STATUS_WORD[lead.status].toLowerCase()}`
                : 'All APIs are healthy'}
          </h2>
          <p className="verdict-detail">
            {sum.total === 0 ? "We can't confirm health until requests arrive. Check that the customer is sending traffic to this environment."
              : lead ? detail(lead)
                : `${fmtInt(sum.total)} requests in ${period}, ${fmtPct(sum.successRate, 2)} succeeded.`}
          </p>
          {others.length > 0 && (
            <ul className="verdict-others" aria-label="Also affected">
              {others.map((h) => (
                <li key={h.service}><span className={`dot dot-${h.status}`} aria-hidden="true" /><span><b>{h.name} API</b> {STATUS_WORD[h.status].toLowerCase()}<span className="muted"> · {h.reason}</span></span></li>
              ))}
            </ul>
          )}
        </div>
        {lead && (
          <button type="button" className="btn btn-primary verdict-action" onClick={() => {
            s.setService(lead.service);
            document.getElementById('ov-activity')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}>{ACTION[lead.cause]} {lead.name} requests<Icon name="arrow" size={14} /></button>
        )}
      </section>

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
              <li key={h.service}>
                <button type="button" className={`svc-row${s.service === h.service ? ' is-selected' : ''}`} aria-pressed={s.service === h.service}
                  onClick={() => s.setService(s.service === h.service ? null : h.service)}
                  aria-label={`${h.name} API: ${STATUS_WORD[h.status]}. ${h.reason}. ${s.service === h.service ? 'Show all APIs' : 'Show only this API'}`}>
                  <span className={`dot dot-${h.status}`} aria-hidden="true" />
                  <span className="svc-row-name">{h.name} API</span>
                  <span className={`svc-row-status st-${h.status}`}>{STATUS_WORD[h.status]}</span>
                  <span className="svc-row-reason">{h.cause === 'stale' ? `${h.reason} · last received ${fmtAgo(h.telemetry?.lastEventAt ?? null, ANCHOR_MS)}` : h.reason}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="ov-perf" className="panel">
          <div className="panel-header">
            <h2 id="ov-perf">Response time and failures{s.service ? ` · ${dataset.services.find((x) => x.id === s.service)?.name} API` : ''}</h2>
            <span className="freshness">Updated {new Date(ANCHOR_MS).toISOString().slice(11, 16)} UTC · {bucketLabel(s.range)} intervals</span>
          </div>
          <TrendChart data={trend(s.scope, s.service)} title={`Response time and failed requests, ${period}`} height={170}
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
          {s.service && <button type="button" className="chip" aria-pressed="true" onClick={() => s.setService(null)}>{dataset.services.find((x) => x.id === s.service)?.name}<Icon name="close" size={12} /><span className="sr-only">Remove service filter</span></button>}
        </div>
        <ActivityTable key={`${s.customerId}-${s.environment}-${s.range}`} pageSize={10} />
      </section>
    </div>
  );
}
