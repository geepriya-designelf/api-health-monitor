import { DownloadDataButton } from '../../components/DataNotice';
import { useScopeContext } from '../../app/ScopeContext';
import { HealthBadge } from '../../components/Badges';
import { Icon } from '../../components/Icon';
import { ANCHOR_MS, dataset } from '../../data/repository';
import { fmtAgo } from '../../utils/format';

export function IntegrationPage() {
  const s = useScopeContext();
  const customers = s.customerId === 'all' ? dataset.customers : dataset.customers.filter((c) => c.id === s.customerId);
  return (
    <div className="stack">
      {customers.map((c) => (
        <section key={c.id} className="panel" aria-labelledby={`int-${c.id}`}>
          <div className="panel-header"><h2 id={`int-${c.id}`}>{c.name}</h2><span className="secondary" style={{ fontSize: 12 }}>Region {c.region} · {c.onboardingStage.replace(/_/g, ' ')}</span></div>
          <dl className="meta-list">
            <dt>Environments</dt><dd>{c.environments.map((e) => (e === 'sandbox' ? 'Sandbox' : 'Production')).join(', ')}</dd>
            <dt>Webhook endpoint</dt><dd className="mono">https://{c.webhookHost}/nium</dd>
            <dt>x-api-key</dt><dd className="muted"><Icon name="lock" size={12} /> Redacted, never stored in this tool</dd>
            <dt>Sandbox limits</dt><dd>50 requests/second, burst 50, 25,000 requests/day <span className="muted">(Nium usage limits page)</span></dd>
            <dt>Production limits</dt><dd className="muted">Not published. Agreed per customer.</dd>
          </dl>
          <h3 className="field-label" style={{ margin: '16px 0 8px' }}>Telemetry sources · {s.environment === 'sandbox' ? 'Sandbox' : 'Production'}</h3>
          <ul className="svc-list">
            {dataset.services.map((svc) => {
              const t = dataset.telemetrySources.find((x) => x.customerId === c.id && x.environment === s.environment && x.service === svc.id);
              const st = !t ? 'unknown' : t.status === 'live' ? 'healthy' : 'unknown';
              return (
                <li key={svc.id} className="tele-row">
                  <span>{svc.name}</span>
                  <HealthBadge status={st} label={!t ? 'Not provisioned' : t.status === 'live' ? 'Live' : t.status === 'stale' ? 'Stale' : 'Missing'} />
                  <span className="muted" style={{ fontSize: 12 }}>{t ? `Last event ${fmtAgo(t.lastEventAt, ANCHOR_MS)}${t.note ? ` · ${t.note}` : ''}` : ''}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="retention-note" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>Everything on this dashboard is synthetic demo data, not real customer traffic. <DownloadDataButton compact /></p>
    </div>
  );
}
