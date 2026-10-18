import { useState } from 'react';
import { useTriage, type TriageStatus } from '../../app/TriageContext';
import { HttpStatusBadge } from '../../components/Badges';
import { handoffText } from './handoff';
import { Icon } from '../../components/Icon';
import { TraceId } from '../../components/TraceId';
import { dataset } from '../../data/repository';
import { OWNER_LABEL, type Diagnosis } from '../../data/triage';
import type { ApiRequest } from '../../data/types';
import { fmtDateTime, fmtMs } from '../../utils/format';

const STATUS_LABEL: Record<TriageStatus, string> = { new: 'New', investigating: 'Investigating', escalated: 'Escalated', resolved: 'Resolved' };
const RESOLUTIONS = ['Customer fixed the request', 'Retried successfully', 'Partner or service recovered', 'Expected behaviour, no action', 'Duplicate of another issue'];

// Reading order: what happened → what to do → the few facts needed to do it. Everything else sits behind "More details".
export function TriagePanel({ r, d, onShowSimilar }: { r: ApiRequest; d: Diagnosis; onShowSimilar: () => void }) {
  const triage = useTriage();
  const rec = triage.get(r.requestId);
  const [checked, setChecked] = useState<boolean[]>(() => d.steps.map(() => false));
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState(RESOLUTIONS[0]);
  const [note, setNote] = useState('');
  const [applySimilar, setApplySimilar] = useState(d.incident);
  const [msg, setMsg] = useState('');
  const svc = dataset.services.find((s) => s.id === r.service);
  const targets = applySimilar ? [r.requestId, ...d.similar.map((x) => x.requestId)] : [r.requestId];
  const scopeNote = targets.length > 1 ? ` (${targets.length})` : '';

  const handoff = `${handoffText(r)}\nLikely cause: ${d.likelyCause}\nSuggested owner: ${OWNER_LABEL[d.owner]}\nRelated failures (30 min): ${d.similar.length}`;
  async function escalate() {
    let copied = true;
    try { await navigator.clipboard.writeText(handoff); } catch { copied = false; }
    triage.update(targets, { status: 'escalated', note: `Escalated to ${OWNER_LABEL[d.owner]}` });
    setMsg(copied ? `Escalated. Handoff copied for ${OWNER_LABEL[d.owner]}.` : 'Escalated. Clipboard blocked: open More details and copy the handoff text.');
  }
  function resolve() {
    triage.update(targets, { status: 'resolved', note: note.trim() ? `${resolution}: ${note.trim()}` : resolution });
    setResolving(false);
    setMsg(`Marked ${targets.length > 1 ? `${targets.length} requests` : 'request'} resolved.`);
  }

  return (
    <div className="tp">
      <header className="tp-head">
        <div className="tp-summary">
          <div className="tp-flags">
            <span className={`tp-status ts-${rec.status}`}>{STATUS_LABEL[rec.status]}</span>
            {d.incident && <span className="badge tone-critical"><Icon name="alert" size={12} />Likely incident</span>}
          </div>
          <h3 className="tp-title">{d.headline}</h3>
          <p className="tp-cause">{d.likelyCause}</p>
          <p className="tp-owner">Suggested owner <b>{OWNER_LABEL[d.owner]}</b> · {d.confidence} confidence · rule-based suggestion</p>
          {rec.note && <p className="tp-owner">Latest: {rec.note}</p>}
        </div>
        {!resolving && (
          <div className="tp-actions">
            {rec.status === 'new' && <button type="button" className="btn" onClick={() => { triage.update(targets, { status: 'investigating', note: 'Investigation started' }); setMsg('Marked investigating.'); }}>Start investigating</button>}
            {(rec.status === 'new' || rec.status === 'investigating') && <button type="button" className="btn" onClick={escalate} aria-label="Escalate and copy handoff"><Icon name="copy" size={14} />Escalate</button>}
            {rec.status !== 'resolved' && <button type="button" className="btn btn-primary" onClick={() => setResolving(true)}>Resolve{scopeNote}</button>}
            {rec.status === 'resolved' && <button type="button" className="btn" onClick={() => { triage.update([r.requestId], { status: 'investigating', note: 'Reopened' }); setMsg('Reopened.'); }}>Reopen</button>}
          </div>
        )}
      </header>

      {d.caution && <p className="tp-caution" role="note"><Icon name="alert" size={14} /><span><b>Before you retry.</b> {d.caution}</span></p>}

      {resolving && (
        <div className="tp-resolve">
          <div className="field"><label htmlFor={`res-${r.requestId}`}>Resolution</label>
            <select id={`res-${r.requestId}`} className="select" value={resolution} onChange={(e) => setResolution(e.target.value)}>{RESOLUTIONS.map((x) => <option key={x}>{x}</option>)}</select></div>
          <div className="field" style={{ flex: 1 }}><label htmlFor={`note-${r.requestId}`}>Note (optional)</label>
            <input id={`note-${r.requestId}`} className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Partner confirmed recovery at 11:55 UTC" /></div>
          <div className="tp-resolve-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setResolving(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={resolve}>Confirm resolve{scopeNote}</button>
          </div>
        </div>
      )}
      <p role="status" aria-live="polite" className="triage-msg">{msg}</p>

      <div className="tp-grid">
        {rec.status !== 'resolved' && (
          <section aria-labelledby={`steps-${r.requestId}`}>
            <h4 id={`steps-${r.requestId}`} className="tp-label">Next steps</h4>
            <ul className="tp-steps">
              {d.steps.map((st, i) => (
                <li key={st}><label><input type="checkbox" checked={checked[i]} onChange={() => setChecked(checked.map((c, j) => (j === i ? !c : c)))} /><span>{st}</span></label></li>
              ))}
            </ul>
            {d.similar.length > 0 && (
              <label className="tp-apply"><input type="checkbox" checked={applySimilar} onChange={(e) => setApplySimilar(e.target.checked)} />Apply actions to {d.similar.length} related failures too</label>
            )}
          </section>
        )}
        <section aria-labelledby={`facts-${r.requestId}`}>
          <h4 id={`facts-${r.requestId}`} className="tp-label">Key details</h4>
          <dl className="tp-facts">
            <dt>Trace ID</dt><dd><TraceId id={r.traceId} available={r.traceAvailable} /></dd>
            <dt>Response</dt><dd><HttpStatusBadge status={r.httpStatus} /> {fmtMs(r.latencyMs)}<span className="muted"> · target P95 {svc?.p95TargetMs} ms</span></dd>
            <dt>Related</dt><dd>{d.similar.length ? <button type="button" className="link-btn" onClick={onShowSimilar}>{d.similar.length} more in 30 min · show in table</button> : <span className="muted">None in 30 min</span>}</dd>
            <dt>Time</dt><dd>{fmtDateTime(r.timestamp)}</dd>
          </dl>
        </section>
      </div>

      <details className="tp-more">
        <summary>More details</summary>
        <div className="tp-more-body">
          <ul className="evidence">{d.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
          <dl className="tp-facts">
            <dt>x-request-id</dt><dd className="mono">{r.xRequestId}</dd>
            <dt>Request</dt><dd className="mono">{r.method} {r.endpoint}</dd>
            {r.systemReferenceNumber && <><dt>Payout ref</dt><dd className="mono">{r.systemReferenceNumber} · {r.transactionStatus}</dd></>}
            <dt>Region</dt><dd>{r.region}</dd>
            <dt>x-api-key</dt><dd className="muted"><Icon name="lock" size={12} /> Redacted</dd>
          </dl>
          <pre className="handoff" aria-label="Handoff text">{handoff}</pre>
        </div>
      </details>
    </div>
  );
}
