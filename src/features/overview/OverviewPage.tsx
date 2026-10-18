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
import { fmtAgo, fmtInt, fmtMs, fmtPct, fmtTime } from '../../utils/format';
import { ActivityTable } from '../activity/ActivityTable';

const VERDICT_ICON: Record<HealthStatus, 'x' | 'alert' | 'check' | 'question'> = { critical: 'x', degraded: 'alert', healthy: 'check', unknown: 'question' };
const STATUS_WORD: Record<HealthStatus, string> = { healthy: 'Healthy', degraded: 'Degraded', critical: 'Critical', unknown: 'No data' };

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
  const leadFailed = lead ? lead.summary.failed : 0;
  const latestFail = [...hooks].reverse().find((w) => w.deliveryStatus === 'failed');

  return (
    <div className="overview">
      <section className={`verdict v-${status}`} aria-label="Integration verdict">
        <span className="verdict-icon" aria-hidden="true"><Icon name={VERDICT_ICON[status]} size={20} /></span>
        <div className="verdict-body" role="status">
          <p className="verdict-eyebrow">{status === 'unknown' ? 'Health unknown' : `Integration ${STATUS_WORD[status].toLowerCase()}`}</p>
          <h2 className="verdict-title">
            {sum.total === 0 ? 'No API traffic in this range'
              : lead ? `${lead.name} is ${STATUS_WORD[lead.status].toLowerCase()}`
                : 'All services are within targets'}
          </h2>
          <p className="verdict-detail">
            {sum.total === 0 ? 'Health cannot be confirmed until requests arrive. Check the customer is sending traffic to this environment.'
              : lead ? `${lead.reason}${leadFailed ? ` · ${fmtInt(leadFailed)} failed ${lead.name} ${leadFailed === 1 ? 'request' : 'requests'} in the last ${RANGE_LABEL[s.range]}` : ''}`
                : `${fmtInt(sum.total)} requests in the last ${RANGE_LABEL[s.range]}, ${fmtPct(sum.successRate, 2)} successful.`}
          </p>
          {others.length > 0 && (
            <ul className="verdict-others" aria-label="Also affected">
              {others.map((h) => (
                <li key={h.service}><span className={`dot dot-${h.status}`} aria-hidden="true" /><span><b>{h.name}</b> {STATUS_WORD[h.status].toLowerCase()}<span className="muted"> · {h.reason}</span></span></li>
              ))}
            </ul>
          )}
        </div>
        {lead && (
          <button type="button" className="btn btn-primary verdict-action" onClick={() => {
            s.setService(lead.service);
            document.getElementById('ov-activity')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}>Investigate {lead.name}<Icon name="arrow" size={14} /></button>
        )}
      </section>

      <section aria-label="Key metrics" className="kpis">
        <div className="kpi"><span className="kpi-label">API calls<InfoTip term="API calls">Every request this customer sent to Nium in the selected environment and time range, successful or not.</InfoTip></span><span className="kpi-value">{fmtInt(sum.total)}</span><span className="kpi-sub">last {RANGE_LABEL[s.range]}</span></div>
        <div className="kpi"><span className="kpi-label">P95 latency<InfoTip term="P95 latency">95% of requests finished faster than this. It shows the slow tail that customers feel, which an average hides.</InfoTip></span><span className="kpi-value">{fmtMs(sum.p95)}</span><span className="kpi-sub">P50 {fmtMs(sum.p50)} · P90 {fmtMs(sum.p90)} · P99 {fmtMs(sum.p99)}</span></div>
        <div className="kpi">
          <span className="kpi-label">Success rate<InfoTip term="Success rate">Share of requests that returned a 2xx response. Timeouts count as unsuccessful because their outcome is unknown.</InfoTip></span>
          <span className="kpi-value" style={{ color: (sum.successRate ?? 100) < 95 ? 'var(--status-error)' : (sum.successRate ?? 100) < 98 ? 'var(--status-warning)' : undefined }}>{fmtPct(sum.successRate, 2)}</span>
          <span className="kpi-sub">{fmtInt(sum.total - sum.failed)} of {fmtInt(sum.total)} · {sum.failed} failed</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Slowest endpoint<InfoTip term="Slowest endpoint">The endpoint with the highest P95 latency in this range. Timeouts are included, so one 30 second timeout can put an endpoint here.</InfoTip></span>
          <span className="kpi-value kpi-text">{slowest?.endpoint.name ?? '—'}</span>
          <span className="kpi-sub">{slowest ? `P95 ${fmtMs(slowest.p95)} · ${dataset.services.find((x) => x.id === slowest.endpoint.service)?.name}` : 'No requests'}</span>
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
                  aria-label={`${h.name}: ${STATUS_WORD[h.status]}. ${h.reason}. ${s.service === h.service ? 'Clear filter' : 'Filter activity'}`}>
                  <span className={`dot dot-${h.status}`} aria-hidden="true" />
                  <span className="svc-row-name">{h.name === 'Payments' ? 'Payments (pay-ins)' : h.name}</span>
                  <span className={`svc-row-status st-${h.status}`}>{STATUS_WORD[h.status]}</span>
                  <span className="svc-row-reason">{h.status === 'healthy' ? `${fmtPct(h.summary.errorRate)} errors · P95 ${fmtMs(h.summary.p95)}` : h.telemetry?.status !== 'live' && h.telemetry ? `${h.reason} · last event ${fmtAgo(h.telemetry.lastEventAt, ANCHOR_MS)}` : h.reason}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="ov-perf" className="panel">
          <div className="panel-header">
            <h2 id="ov-perf">API performance{s.service ? ` · ${dataset.services.find((x) => x.id === s.service)?.name}` : ''}</h2>
            <span className="freshness">Data as of {new Date(ANCHOR_MS).toISOString().slice(11, 16)} UTC · {bucketLabel(s.range)} intervals</span>
          </div>
          <TrendChart data={trend(s.scope, s.service)} title={`API latency and error rate, last ${RANGE_LABEL[s.range]}`} height={170}
            targetMs={s.service ? dataset.services.find((x) => x.id === s.service)?.p95TargetMs : undefined} />
        </section>
        <section aria-labelledby="ov-wh" className="panel">
          <div className="panel-header"><h2 id="ov-wh">Webhooks</h2><HealthBadge status={whStatus} label={whStatus === 'unknown' ? 'No events' : undefined} /></div>
          <div className="wh-big">{fmtPct(wh.successRate)}<span>delivered</span></div>
          {wh.total > 0 && (
            <div className="meter" role="img" aria-label={`${wh.delivered} delivered, ${wh.delayed} delayed, ${wh.failed} failed`}>
              <span style={{ flexGrow: wh.delivered, background: 'var(--text-muted)' }} />
              <span style={{ flexGrow: wh.delayed, background: 'var(--status-warning)' }} />
              <span style={{ flexGrow: wh.failed, background: 'var(--status-error-fill)' }} />
            </div>
          )}
          <div className="wh-split">
            <span><b>{wh.delivered}</b> delivered</span>
            <span className={wh.delayed ? 'warn' : ''}><b>{wh.delayed}</b> delayed</span>
            <span className={wh.failed ? 'err' : ''}><b>{wh.failed}</b> failed</span>
          </div>
          {latestFail ? (
            <p className="wh-last">Last failure {fmtTime(latestFail.timestamp)} · <span className="mono">{latestFail.template.replace('REMIT_TRANSACTION_', '').replace('_WEBHOOK', '')}</span> · HTTP {latestFail.responseStatus}</p>
          ) : <p className="wh-last muted">No failed deliveries in range.</p>}
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
