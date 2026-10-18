#!/usr/bin/env node
// Validates data/nium-dashboard-mock-data.json: schema, referential integrity, and that the
// aggregate metrics reconcile with the retained request and webhook logs.
import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync(new URL('../data/nium-dashboard-mock-data.json', import.meta.url), 'utf8'));
const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };
const anchor = Date.parse(d.meta.anchorTime);
const M = d.metrics;
const BINS = M.latencyBinsMs;
const windowStart = Date.parse(M.windowStart);
const bucketOf = (iso) => Math.floor((Date.parse(iso) - windowStart) / (M.bucketMinutes * 60_000));

check(d.meta.synthetic === true, 'meta.synthetic must be true');
for (const k of ['services', 'endpoints', 'customers', 'telemetrySources', 'requests', 'webhooks', 'alerts']) check(Array.isArray(d[k]), `${k} must be an array`);
check(Array.isArray(M?.series) && Array.isArray(d.webhookMetrics?.series), 'metrics and webhookMetrics series must exist');

const svcIds = new Set(d.services.map((s) => s.id));
const epById = new Map(d.endpoints.map((e) => [e.id, e]));
const custById = new Map(d.customers.map((c) => [c.id, c]));

// ---- Metric points: shape and internal consistency
const metricKey = (c, e, ep, b) => `${c}|${e}|${ep}|${b}`;
const metricIndex = new Map();
for (const se of M.series) {
  const c = custById.get(se.customerId);
  check(c && c.environments.includes(se.environment), `series ${se.customerId}/${se.environment}: not provisioned`);
  check(epById.get(se.endpointId)?.service === se.service, `series ${se.endpointId}: service mismatch`);
  for (const p of se.points) {
    check(p.length === 7 + BINS.length, `point length wrong in ${se.endpointId}`);
    const [b, total, client, server, timeout, slow] = p;
    const hist = p.slice(7);
    check(b >= 0 && b < M.bucketCount, `bucket out of range in ${se.endpointId}`);
    check(hist.reduce((a, x) => a + x, 0) === total, `${se.customerId}/${se.endpointId}@${b}: histogram does not sum to total`);
    check(client + server + timeout <= total, `${se.customerId}/${se.endpointId}@${b}: errors exceed total`);
    check(hist.at(-1) === timeout, `${se.customerId}/${se.endpointId}@${b}: timeout bin must equal timeouts`);
    check(slow <= total, `${se.customerId}/${se.endpointId}@${b}: slow exceeds total`);
    metricIndex.set(metricKey(se.customerId, se.environment, se.endpointId, b), p);
  }
}

// ---- Retained request log
const reqIds = new Set();
const traceSeen = new Set();
const retainedFails = new Map();
const retainedSlow = new Map();
const reqFields = { requestId: 'string', xRequestId: 'string', traceId: 'string', customerId: 'string', environment: 'string', service: 'string', endpointId: 'string', method: 'string', endpoint: 'string', timestamp: 'string', httpStatus: 'number', latencyMs: 'number', outcome: 'string', traceAvailable: 'boolean', retention: 'string', synthetic: 'boolean' };
for (const r of d.requests) {
  for (const [f, t] of Object.entries(reqFields)) check(typeof r[f] === t, `${r.requestId}: ${f} should be ${t}`);
  check(!reqIds.has(r.requestId), `duplicate requestId ${r.requestId}`); reqIds.add(r.requestId);
  check(!traceSeen.has(r.traceId), `duplicate traceId ${r.traceId}`); traceSeen.add(r.traceId);
  check(/^[0-9a-f-]{36}$/.test(r.xRequestId), `${r.requestId}: xRequestId must be a 36-char UUID`);
  check(r.synthetic === true, `${r.requestId}: synthetic must be true`);
  check(svcIds.has(r.service), `${r.requestId}: unknown service`);
  const ep = epById.get(r.endpointId);
  check(ep && ep.service === r.service && ep.method === r.method && ep.path === r.endpoint, `${r.requestId}: endpoint mismatch`);
  const t = Date.parse(r.timestamp);
  check(t <= anchor && anchor - t <= d.meta.windowHours * 3600_000, `${r.requestId}: timestamp outside window`);
  const okStatus = { success: (s) => s >= 200 && s < 300, client_error: (s) => s >= 400 && s < 500, server_error: (s) => s >= 500 && s !== 504, timeout: (s) => s === 504 }[r.outcome];
  check(okStatus && okStatus(r.httpStatus), `${r.requestId}: outcome ${r.outcome} inconsistent with HTTP ${r.httpStatus}`);
  check((r.outcome === 'success') === (r.errorCode === null), `${r.requestId}: errorCode must be null only for success`);
  const expectedRetention = r.outcome !== 'success' ? 'error' : ['FAILED', 'RETURNED'].includes(r.transactionStatus) ? 'payout_failed' : r.latencyMs >= 1000 ? 'slow' : null;
  if (expectedRetention) check(r.retention === expectedRetention, `${r.requestId}: retention should be ${expectedRetention}`);
  const key = metricKey(r.customerId, r.environment, r.endpointId, bucketOf(r.timestamp));
  check(metricIndex.has(key), `${r.requestId}: no metric point for its bucket`);
  if (r.outcome !== 'success') retainedFails.set(key, (retainedFails.get(key) ?? 0) + 1);
  if (r.latencyMs >= 1000) retainedSlow.set(key, (retainedSlow.get(key) ?? 0) + 1);
}
// Every failure and slow request counted in the metrics must be present in the retained log.
for (const [key, p] of metricIndex) {
  check((retainedFails.get(key) ?? 0) === p[2] + p[3] + p[4], `${key}: metric failures (${p[2] + p[3] + p[4]}) != retained failures (${retainedFails.get(key) ?? 0})`);
  check((retainedSlow.get(key) ?? 0) === p[5], `${key}: metric slow (${p[5]}) != retained slow (${retainedSlow.get(key) ?? 0})`);
}

// ---- Webhooks
const whProblemsByBucket = new Map();
for (const w of d.webhooks) {
  check(reqIds.has(w.relatedRequestId), `${w.webhookId}: relatedRequestId not retained`);
  check(['delivered', 'delayed', 'failed'].includes(w.deliveryStatus), `${w.webhookId}: bad deliveryStatus`);
  check(w.deliveryStatus !== 'failed' || w.deliveryLatencyMs === null, `${w.webhookId}: failed delivery should have no latency`);
  check(w.synthetic === true, `${w.webhookId}: synthetic must be true`);
  if (w.deliveryStatus !== 'delivered') {
    const k = `${w.customerId}|${w.environment}|${bucketOf(w.timestamp)}`;
    whProblemsByBucket.set(k, (whProblemsByBucket.get(k) ?? 0) + 1);
  }
}
for (const se of d.webhookMetrics.series) for (const p of se.points) {
  check(p[1] === p[2] + p[3] + p[4], `webhook point ${se.customerId}@${p[0]}: total mismatch`);
  const k = `${se.customerId}|${se.environment}|${p[0]}`;
  check((whProblemsByBucket.get(k) ?? 0) === p[3] + p[4], `${k}: webhook problems in metrics != retained problems`);
}

// ---- Telemetry status vs data
for (const t of d.telemetrySources) {
  const series = M.series.filter((s) => s.customerId === t.customerId && s.environment === t.environment && s.service === t.service);
  const last = Math.max(-1, ...series.flatMap((s) => s.points.map((p) => p[0])));
  if (t.status === 'missing') check(series.length === 0, `${t.customerId}/${t.environment}/${t.service}: missing telemetry but has metrics`);
  if (t.status === 'stale') check(anchor - (windowStart + (last + 1) * M.bucketMinutes * 60_000) >= 3 * 3600_000, `${t.customerId}/${t.environment}/${t.service}: stale but has recent metrics`);
}

// ---- Percentile order per scope (from merged histograms)
const pct = (hist, p) => { const total = hist.reduce((a, b) => a + b, 0); let cum = 0; for (let i = 0; i < hist.length; i++) { cum += hist[i]; if (cum >= (p / 100) * total) return BINS[i]; } return BINS.at(-1); };
const summary = [];
for (const c of d.customers) for (const env of c.environments) {
  const series = M.series.filter((s) => s.customerId === c.id && s.environment === env);
  if (!series.length) { summary.push(`${c.id}/${env}: no traffic (intentional empty state)`); continue; }
  const hist = BINS.map(() => 0);
  let total = 0, failed = 0, last90 = 0;
  for (const s of series) for (const p of s.points) {
    total += p[1]; failed += p[2] + p[3] + p[4];
    if (p[0] >= M.bucketCount - 18) last90 += p[1];
    for (let i = 0; i < BINS.length; i++) hist[i] += p[7 + i];
  }
  const [p50, p90, p95, p99] = [50, 90, 95, 99].map((p) => pct(hist, p));
  check(p50 <= p90 && p90 <= p95 && p95 <= p99, `${c.id}/${env}: percentile order broken`);
  const wh = d.webhookMetrics.series.find((s) => s.customerId === c.id && s.environment === env);
  const whTotal = wh ? wh.points.reduce((a, p) => a + p[1], 0) : 0;
  const whOk = wh ? wh.points.reduce((a, p) => a + p[2], 0) : 0;
  summary.push(`${c.id}/${env}: ${total.toLocaleString('en-US')} req/24h (${last90.toLocaleString('en-US')} in last 90 min), ${((failed / total) * 100).toFixed(2)}% failed, P50/P90/P95/P99 bins ≤${p50}/${p90}/${p95}/${p99} ms, webhooks ${((whOk / Math.max(1, whTotal)) * 100).toFixed(1)}% delivered`);
}

// ---- No secrets or sensitive payment data
const text = JSON.stringify(d.requests) + JSON.stringify(d.webhooks) + JSON.stringify(d.customers);
check(!/(api[_-]?key|secret|password|bearer)\s*["':=]+\s*["']?[A-Za-z0-9]{12,}/i.test(text), 'possible credential in dataset');
check(!/\b\d{13,19}\b/.test(text.replace(/"(timestamp|lastEventAt)":"[^"]*"/g, '')), 'possible card/account number in dataset');

console.log(summary.join('\n'));
if (problems.length) { console.error(`\n${problems.length} problem(s):\n` + problems.slice(0, 40).join('\n')); process.exit(1); }
console.log(`\nOK: ${M.series.length} metric series, ${d.requests.length} retained requests, ${d.webhooks.length} retained webhooks, ${d.alerts.length} alerts. All checks passed.`);
