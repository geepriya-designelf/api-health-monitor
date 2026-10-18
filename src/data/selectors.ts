// Pure, derived metrics. KPIs, charts and service health are computed from the 5-minute metric
// aggregates (every request counted); tables and triage read the retained request log.
import { ANCHOR_MS, dataset } from './repository';
import type { ApiRequest, Environment, HealthStatus, MetricPoint, ServiceId, TelemetrySource, TimeRange, WebhookDelivery } from './types';

export const RANGE_HOURS: Record<TimeRange, number> = { '90m': 1.5, '3h': 3, '8h': 8, '24h': 24 };
export const RANGE_LABEL: Record<TimeRange, string> = { '90m': '90 min', '3h': '3 hrs', '8h': '8 hrs', '24h': '24 hrs' };
const DISPLAY_BUCKET_MIN: Record<TimeRange, number> = { '90m': 5, '3h': 10, '8h': 30, '24h': 60 };
export const bucketLabel = (r: TimeRange) => `${DISPLAY_BUCKET_MIN[r]} min`;
export const SLOW_MS = 1000;
export const SAMPLE_RATE = dataset.meta.retention.successSampleRate;

const M = dataset.metrics;
const BINS = M.latencyBinsMs;
const BASE_MIN = M.bucketMinutes;
const WINDOW_START = Date.parse(M.windowStart);
const firstBucket = (range: TimeRange) => M.bucketCount - (RANGE_HOURS[range] * 60) / BASE_MIN;
const bucketTime = (b: number) => WINDOW_START + b * BASE_MIN * 60_000;

export interface Scope { customerId: string; environment: Environment; range: TimeRange }

// ---------- Retained logs (for tables and triage) ----------
const inRange = (iso: string, range: TimeRange) => ANCHOR_MS - Date.parse(iso) <= RANGE_HOURS[range] * 3600_000;
export function scopedRequests(s: Scope): ApiRequest[] {
  return dataset.requests.filter((r) => r.customerId === s.customerId && r.environment === s.environment && inRange(r.timestamp, s.range));
}
export function scopedWebhooks(s: Scope): WebhookDelivery[] {
  return dataset.webhooks.filter((w) => w.customerId === s.customerId && w.environment === s.environment && inRange(w.timestamp, s.range));
}

// ---------- Aggregates ----------
interface Acc { total: number; client: number; server: number; timeout: number; slow: number; asyncFail: number; hist: number[] }
const emptyAcc = (): Acc => ({ total: 0, client: 0, server: 0, timeout: 0, slow: 0, asyncFail: 0, hist: BINS.map(() => 0) });
function add(acc: Acc, p: MetricPoint) {
  acc.total += p[1]; acc.client += p[2]; acc.server += p[3]; acc.timeout += p[4]; acc.slow += p[5]; acc.asyncFail += p[6];
  for (let i = 0; i < BINS.length; i++) acc.hist[i] += p[7 + i];
}
function seriesFor(s: Scope, filter?: { service?: ServiceId; endpointId?: string }) {
  return M.series.filter((x) => x.customerId === s.customerId && x.environment === s.environment &&
    (!filter?.service || x.service === filter.service) && (!filter?.endpointId || x.endpointId === filter.endpointId));
}
function accumulate(s: Scope, filter?: { service?: ServiceId; endpointId?: string }, fromBucket = firstBucket(s.range), toBucket = M.bucketCount): Acc {
  const acc = emptyAcc();
  for (const se of seriesFor(s, filter)) for (const p of se.points) if (p[0] >= fromBucket && p[0] < toBucket) add(acc, p);
  return acc;
}

// Percentile from a latency histogram with linear interpolation inside the bin.
// The last bin holds 30 s timeouts only, so it resolves to exactly 30 000 ms.
export function histPercentile(hist: number[], p: number, excludeTimeouts = false): number | null {
  const h = excludeTimeouts ? hist.slice(0, -1) : hist;
  const total = h.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const target = (p / 100) * total;
  let cum = 0;
  for (let i = 0; i < h.length; i++) {
    if (cum + h[i] >= target && h[i] > 0) {
      if (i === BINS.length - 1) return BINS[i];
      const lo = i === 0 ? 0 : BINS[i - 1];
      return Math.round(lo + ((BINS[i] - lo) * (target - cum)) / h[i]);
    }
    cum += h[i];
  }
  return BINS[h.length - 1];
}

export interface Summary {
  total: number; failed: number; successRate: number | null; errorRate: number | null;
  serverSideRate: number | null; clientErrorRate: number | null;
  serverErrors: number; clientErrors: number; timeouts: number; slow: number; asyncPayoutFailures: number;
  p50: number | null; p90: number | null; p95: number | null; p99: number | null;
}
function toSummary(a: Acc): Summary {
  const failed = a.client + a.server + a.timeout;
  const pct = (n: number) => (a.total ? (n / a.total) * 100 : null);
  return {
    total: a.total, failed, successRate: pct(a.total - failed), errorRate: pct(failed),
    serverSideRate: pct(a.server + a.timeout), clientErrorRate: pct(a.client),
    serverErrors: a.server, clientErrors: a.client, timeouts: a.timeout, slow: a.slow, asyncPayoutFailures: a.asyncFail,
    p50: histPercentile(a.hist, 50), p90: histPercentile(a.hist, 90), p95: histPercentile(a.hist, 95), p99: histPercentile(a.hist, 99),
  };
}
export const summarizeScope = (s: Scope, service?: ServiceId) => toSummary(accumulate(s, { service }));

// Successful calls on one endpoint between two times (used by triage evidence).
export function successBetween(s: Scope, endpointId: string, fromMs: number, toMs: number): number {
  const a = accumulate(s, { endpointId }, Math.floor((fromMs - WINDOW_START) / (BASE_MIN * 60_000)), Math.ceil((toMs - WINDOW_START) / (BASE_MIN * 60_000)));
  return a.total - a.client - a.server - a.timeout;
}

export function webhookSummary(s: Scope) {
  let total = 0, delivered = 0, delayed = 0, failed = 0;
  const from = firstBucket(s.range);
  for (const se of dataset.webhookMetrics.series) {
    if (se.customerId !== s.customerId || se.environment !== s.environment) continue;
    for (const p of se.points) if (p[0] >= from) { total += p[1]; delivered += p[2]; delayed += p[3]; failed += p[4]; }
  }
  return { total, delivered, delayed, failed, successRate: total ? (delivered / total) * 100 : null };
}

// Webhook delivery health: < 90% delivered is critical, < 97% degraded (prototype assumption).
export function webhookStatus(w: ReturnType<typeof webhookSummary>): HealthStatus {
  if (w.successRate == null) return 'unknown';
  return w.successRate < 90 ? 'critical' : w.successRate < 97 ? 'degraded' : 'healthy';
}

export function telemetryFor(customerId: string, environment: Environment, service: ServiceId): TelemetrySource | undefined {
  return dataset.telemetrySources.find((t) => t.customerId === customerId && t.environment === environment && t.service === service);
}

export interface ServiceHealth {
  service: ServiceId; name: string; status: HealthStatus; reason: string; summary: Summary;
  telemetry: TelemetrySource | undefined; p95TargetMs: number;
}
// Health rules (prototype assumptions):
//   unknown  – telemetry missing or stale, or no requests in range (never shown as healthy)
//   critical – server-side failure rate (5xx + timeouts) ≥ 5%, or P95 ≥ 2× target
//   degraded – server-side failure rate ≥ 1%, client error rate (4xx) ≥ 10%, or P95 > target
//   healthy  – otherwise
// 4xx responses usually mean the integration sent a bad request, so they degrade but never make a service critical.
export function serviceHealth(s: Scope): ServiceHealth[] {
  return dataset.services.map((svc) => {
    const telemetry = telemetryFor(s.customerId, s.environment, svc.id);
    const summary = summarizeScope(s, svc.id);
    const srv = summary.serverSideRate ?? 0;
    const cli = summary.clientErrorRate ?? 0;
    const p95 = summary.p95 ?? 0;
    let status: HealthStatus = 'healthy';
    let reason = 'Within targets';
    if (!telemetry || telemetry.status === 'missing') { status = 'unknown'; reason = 'Telemetry missing'; }
    else if (telemetry.status === 'stale') { status = 'unknown'; reason = 'Telemetry stale'; }
    else if (summary.total === 0) { status = 'unknown'; reason = 'No requests in range'; }
    else if (srv >= 5 || p95 >= svc.p95TargetMs * 2) {
      status = 'critical'; reason = srv >= 5 ? `${srv.toFixed(1)}% server errors and timeouts` : `P95 ${p95} ms, over 2× the ${svc.p95TargetMs} ms target`;
    } else if (srv >= 1 || cli >= 10 || p95 > svc.p95TargetMs) {
      status = 'degraded';
      reason = srv >= 1 ? `${srv.toFixed(1)}% server errors and timeouts` : cli >= 10 ? `${cli.toFixed(1)}% client errors (4xx)` : `P95 ${p95} ms over ${svc.p95TargetMs} ms target`;
    }
    return { service: svc.id, name: svc.name, status, reason, summary, telemetry, p95TargetMs: svc.p95TargetMs };
  });
}

export function overallStatus(h: ServiceHealth[]): HealthStatus {
  if (h.some((x) => x.status === 'critical')) return 'critical';
  if (h.some((x) => x.status === 'degraded')) return 'degraded';
  if (h.every((x) => x.status === 'unknown')) return 'unknown';
  return 'healthy';
}

export interface TrendPoint { t: number; label: string; requests: number; failed: number; errorRate: number | null; p99: number | null; p95: number | null; p50: number | null }
// Chart series: merges 5-minute aggregates into display intervals. Latency lines exclude 30 s timeouts.
export function trend(s: Scope, service?: ServiceId | null): TrendPoint[] {
  const per = DISPLAY_BUCKET_MIN[s.range] / BASE_MIN;
  const from = firstBucket(s.range);
  const n = (M.bucketCount - from) / per;
  const accs = Array.from({ length: n }, emptyAcc);
  for (const se of seriesFor(s, { service: service ?? undefined })) for (const p of se.points) if (p[0] >= from) add(accs[Math.floor((p[0] - from) / per)], p);
  return accs.map((a, i) => {
    const t = bucketTime(from + (i + 1) * per);
    const failed = a.client + a.server + a.timeout;
    return {
      t, label: new Date(t).toISOString().slice(11, 16), requests: a.total, failed,
      errorRate: a.total ? (failed / a.total) * 100 : null,
      p99: histPercentile(a.hist, 99, true), p95: histPercentile(a.hist, 95, true), p50: histPercentile(a.hist, 50, true),
    };
  });
}

export function endpointBreakdown(s: Scope) {
  return dataset.endpoints
    .map((e) => ({ endpoint: e, ...toSummary(accumulate(s, { endpointId: e.id })) }))
    .filter((x) => x.total > 0)
    .sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0));
}
