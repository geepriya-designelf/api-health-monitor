import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useScopeContext } from '../../app/ScopeContext';
import { useTriage, type TriageStatus } from '../../app/TriageContext';
import { HttpStatusBadge, MethodTag } from '../../components/Badges';
import { Icon } from '../../components/Icon';
import { TraceId } from '../../components/TraceId';
import { dataset } from '../../data/repository';
import { SAMPLE_RATE, SLOW_MS, scopedRequests, summarizeScope } from '../../data/selectors';
import { diagnose, needsTriage } from '../../data/triage';
import type { ServiceId } from '../../data/types';
import { fmtMs, fmtTime, shortPath } from '../../utils/format';
import { TriagePanel } from './TriagePanel';

type SortKey = 'timestamp' | 'latencyMs' | 'httpStatus';
const svcName = (id: string) => dataset.services.find((s) => s.id === id)?.name ?? id;
const epName = (id: string) => dataset.endpoints.find((e) => e.id === id)?.name ?? id;
const STATUS_LABEL: Record<TriageStatus, string> = { new: 'Needs resolution', investigating: 'Investigating', escalated: 'Escalated', resolved: 'Resolved' };

export function ActivityTable({ pageSize = 10 }: { pageSize?: number }) {
  const s = useScopeContext();
  const triage = useTriage();
  const all = useMemo(() => scopedRequests(s.scope), [s.scope.customerId, s.scope.environment, s.scope.range]);
  const totals = useMemo(() => summarizeScope(s.scope, s.service ?? undefined), [s.scope.customerId, s.scope.environment, s.scope.range, s.service]);
  // The assistant can hand over a trace ID to search for ("Open in API activity").
  const [q, setQ] = useState(() => { try { const v = sessionStorage.getItem('nium-pending-search') ?? ''; sessionStorage.removeItem('nium-pending-search'); return v; } catch { return ''; } });
  useEffect(() => {
    const onSearch = (e: Event) => { setQ((e as CustomEvent<string>).detail); setPage(0); };
    window.addEventListener('nium-search', onSearch);
    return () => window.removeEventListener('nium-search', onSearch);
  }, []);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [errorCode, setErrorCode] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'timestamp', dir: 'desc' });
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Keep the expanded detail panel pinned to the visible table width, even when the table scrolls sideways.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWrapW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isIssue = needsTriage;
  const base = s.service ? all.filter((r) => r.service === s.service) : all;
  const errorLabel = (r: (typeof all)[number]) => r.errorCode ?? (r.transactionStatus === 'FAILED' || r.transactionStatus === 'RETURNED' ? `PAYOUT_${r.transactionStatus}` : null);
  const apiErrorCount = base.filter((r) => r.outcome !== 'success').length;
  // Error column filter: one option per error code present in the current scope, most frequent first.
  const errorOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of base) { const k = errorLabel(r); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [base]);
  const needle = q.trim().toLowerCase();
  // The open row stays pinned so its confirmation stays visible after a triage change filters it out.
  const filtered = base.filter((r) => r.requestId === expanded ||
    (!errorsOnly || r.outcome !== 'success') && (!errorCode || errorLabel(r) === errorCode) &&
    (!needle || [r.traceId, r.traceId.replace('demo-trace-', 'dt-'), r.xRequestId, r.endpoint, epName(r.endpointId), r.errorCode ?? '', r.errorSummary ?? '', String(r.httpStatus), r.systemReferenceNumber ?? ''].some((f) => f.toLowerCase().includes(needle))));
  const m = sort.dir === 'asc' ? 1 : -1;
  filtered.sort((a, b) => (a[sort.key] < b[sort.key] ? -m : a[sort.key] > b[sort.key] ? m : 0));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const visible = filtered.slice(cur * pageSize, (cur + 1) * pageSize);
  const reset = () => { setPage(0); };
  // Expert shortcut: "/" jumps to search from anywhere on the page.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) { e.preventDefault(); searchRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const th = (key: SortKey, label: string, cls?: string) => {
    const active = sort.key === key;
    return (
      <th scope="col" className={cls} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" onClick={() => { setSort({ key, dir: active && sort.dir === 'desc' ? 'asc' : 'desc' }); reset(); }}>
          {label}<Icon name={active ? (sort.dir === 'asc' ? 'sortAsc' : 'sortDesc') : 'sort'} size={12} />
        </button>
      </th>
    );
  };

  return (
    <div className="activity">
      <div className="activity-toolbar">
        <div className="search">
          <span aria-hidden="true"><Icon name="search" size={14} /></span>
          <input ref={searchRef} className="input" type="search" value={q} onChange={(e) => { setQ(e.target.value); reset(); }}
            placeholder="Search by trace ID, request ID, endpoint or error code" aria-label="Search API requests" aria-keyshortcuts="/" />
          <kbd className="search-kbd" aria-hidden="true">/</kbd>
        </div>
        <label className="sr-only" htmlFor="svc-filter">Service</label>
        <select id="svc-filter" className="select" value={s.service ?? ''} onChange={(e) => { s.setService((e.target.value || null) as ServiceId | null); reset(); }}>
          <option value="">All services</option>
          {dataset.services.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <button type="button" className={`toggle-btn${errorsOnly ? ' is-on' : ''}`} aria-pressed={errorsOnly} onClick={() => { setErrorsOnly(!errorsOnly); reset(); }}>
          <span className="toggle-box" aria-hidden="true">{errorsOnly && <Icon name="check" size={12} />}</span>
          Failed requests only<span className="toggle-count">{apiErrorCount.toLocaleString('en-US')}</span>
        </button>
        <span className="muted result-count" role="status" aria-live="polite">Showing {filtered.length.toLocaleString('en-US')}</span>
      </div>

      <p className="retention-note">
        <b>{totals.total.toLocaleString('en-US')}</b> requests in this period. This log keeps every failed and slow request, plus a {SAMPLE_RATE * 100}% sample of successful ones.
      </p>
      <div className="table-wrap activity-table" ref={wrapRef} tabIndex={0} role="region" aria-label="API activity table, scrollable" style={{ ['--wrap-w' as string]: wrapW ? `${wrapW}px` : '100%' }}>
        <table className="data">
          <caption className="sr-only">API activity for the selected environment. Expand a row to see details; failed rows include diagnosis and resolve actions.</caption>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Expand</span></th>
              {th('timestamp', 'Time')}
              <th scope="col">Trace ID</th>
              <th scope="col">Endpoint</th>
              <th scope="col">API</th>
              {th('httpStatus', 'HTTP')}
              <th scope="col" className="th-filter">
                <span>Error</span>
                <label className="sr-only" htmlFor="err-filter">Filter by error</label>
                <select id="err-filter" className={`th-select${errorCode ? ' is-active' : ''}`} value={errorCode} onChange={(e) => { setErrorCode(e.target.value); reset(); }}>
                  <option value="">All errors</option>
                  {errorOptions.map(([k, n]) => <option key={k} value={k}>{k} ({n})</option>)}
                </select>
              </th>
              {th('latencyMs', 'Response time', 'num')}
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={9} className="empty-cell">
                {all.length === 0 ? 'No requests for this customer and environment in this period.' : 'No requests match your filters.'}
                {all.length > 0 && <button type="button" className="btn btn-sm" onClick={() => { setQ(''); setErrorsOnly(false); setErrorCode(''); s.setService(null); }}>Clear filters</button>}
              </td></tr>
            )}
            {visible.map((r) => {
              const issue = isIssue(r);
              const asyncFail = r.transactionStatus === 'FAILED' || r.transactionStatus === 'RETURNED';
              const slowOk = r.outcome === 'success' && !asyncFail && r.latencyMs >= SLOW_MS;
              const t = triage.get(r.requestId);
              const open = expanded === r.requestId;
              const toggle = () => setExpanded(open ? null : r.requestId);
              return (
                <Fragment key={r.requestId}>
                  <tr className={`row ${issue ? 'is-failed' : ''} ${open ? 'is-open' : ''} ${issue && t.status === 'resolved' ? 'is-resolved' : ''}`} onClick={toggle}>
                    <td style={{ width: 36 }}>
                      <button type="button" className="expand-btn" aria-expanded={open} aria-controls={`detail-${r.requestId}`}
                        aria-label={`${open ? 'Hide' : 'Show'} details for ${epName(r.endpointId)} at ${fmtTime(r.timestamp)}`} onClick={(e) => { e.stopPropagation(); toggle(); }}>
                        <Icon name="chevron" size={14} />
                      </button>
                    </td>
                    <td className="mono">{fmtTime(r.timestamp)}</td>
                    <td onClick={(e) => e.stopPropagation()}><TraceId id={r.traceId} available={r.traceAvailable} /></td>
                    <td><div className="endpoint-cell"><MethodTag method={r.method} /><span>{epName(r.endpointId)}</span><span className="path" title={r.endpoint}>{shortPath(r.endpoint)}</span></div></td>
                    <td>{svcName(r.service)}</td>
                    <td><HttpStatusBadge status={r.httpStatus} /></td>
                    <td className="err-cell" title={r.errorSummary ?? undefined}>
                      {r.errorCode ? <span className="mono">{r.errorCode}</span> : asyncFail ? <span className="mono">PAYOUT_{r.transactionStatus}</span> : <span className="muted">—</span>}
                    </td>
                    <td className={`num ${r.outcome === 'timeout' ? 'lat-timeout' : r.latencyMs >= SLOW_MS ? 'lat-slow' : ''}`}>{fmtMs(r.latencyMs)}</td>
                    <td>
                      <div className="outcome-cell">
                        {r.outcome === 'timeout' ? <span className="badge tone-warning"><Icon name="question" size={12} />Outcome unknown</span>
                          : asyncFail ? <span className="badge tone-critical"><Icon name="x" size={12} />Payout {r.transactionStatus?.toLowerCase()}</span>
                            : r.outcome === 'client_error' ? <span className="badge tone-warning"><Icon name="alert" size={12} />Rejected</span>
                            : r.outcome !== 'success' ? <span className="badge tone-critical"><Icon name="x" size={12} />Failed</span>
                              : <span className={`quiet-ok${slowOk ? ' is-slow' : ''}`}><Icon name="check" size={12} />{slowOk ? 'Succeeded, slow' : 'Succeeded'}</span>}
                        {issue && <span className={`triage-state ts-${t.status}`}>{STATUS_LABEL[t.status]}</span>}
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr className="detail-row" id={`detail-${r.requestId}`}>
                      <td colSpan={9}>
                        {issue || slowOk
                          ? <TriagePanel r={r} d={diagnose(r, all)} onShowSimilar={() => { setQ(''); setErrorCode(''); setErrorsOnly(true); s.setService(r.service); reset(); }} />
                          : (
                            <dl className="meta-list compact success-detail">
                              <dt>x-request-id</dt><dd className="mono">{r.xRequestId}</dd>
                              <dt>Request</dt><dd className="mono">{r.method} {r.endpoint}</dd>
                              <dt>Region</dt><dd>{r.region}</dd>
                              {r.systemReferenceNumber && <><dt>systemReferenceNumber</dt><dd className="mono">{r.systemReferenceNumber} · {r.transactionStatus}</dd></>}
                            </dl>
                          )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pagination" className="pager">
        <span className="muted">Page {cur + 1} of {pages}</span>
        <button type="button" className="btn btn-sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</button>
        <button type="button" className="btn btn-sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</button>
      </nav>
    </div>
  );
}
