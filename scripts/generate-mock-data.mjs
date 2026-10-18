#!/usr/bin/env node
// Generates data/nium-dashboard-mock-data.json — SYNTHETIC telemetry for the prototype.
// Deterministic (seeded PRNG) so the dataset is stable between runs.
// Nothing here is real Nium traffic, real customer data, or measured Nium performance.
//
// Model (mirrors how observability stacks store data at scale):
//   metrics        5-minute aggregates per customer/environment/endpoint with latency histograms.
//                  Every KPI, chart and health status is computed from these.
//   requests       Retained request log: ALL failed and slow requests, payouts that later failed or
//                  had webhook problems, plus a 1% sample of successful requests (tail-based retention).
//   webhookMetrics 5-minute webhook delivery aggregates.
//   webhooks       Retained webhook log: all failed and delayed deliveries plus a 1% sample.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANCHOR = Date.parse('2026-10-17T12:00:00Z'); // "now" for the demo dataset
const HOUR = 3600_000;
const BUCKET_MIN = 5;
const BUCKETS = (24 * 60) / BUCKET_MIN; // 288
const START = ANCHOR - 24 * HOUR;
const SUCCESS_SAMPLE_RATE = 0.01;
const SLOW_MS = 1000;
// Histogram bin upper bounds (ms). The last bin holds 30 s gateway timeouts only.
const LATENCY_BINS = [25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 650, 800, 1000, 1500, 2000, 3000, 5000, 10000, 30000];

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261017);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const hex = (n) => Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join('');
const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-${pick(['8', '9', 'a', 'b'])}${hex(3)}-${hex(12)}`;
function normal() {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
// Lognormal latency: median m, sigma s. sigma 0.55 gives P90 ≈ 2.0×m, P95 ≈ 2.5×m, P99 ≈ 3.6×m.
const lognormal = (m, s = 0.55) => Math.round(m * Math.exp(s * normal()));
const binOf = (ms) => LATENCY_BINS.findIndex((b) => ms <= b);
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

// ---------------------------------------------------------------------------
// Reference catalogue. docStatus:
//   "verified"     – path seen in public Nium docs during research (2026-10-17)
//   "unverified"   – follows Nium's documented URL pattern but the exact path was not confirmed
//   "illustrative" – placeholder for the prototype; not a claimed Nium endpoint
// ---------------------------------------------------------------------------
const services = [
  { id: 'payments', name: 'Payments', p95TargetMs: 600, description: 'Pay-ins and payment collection' },
  { id: 'payouts', name: 'Payouts', p95TargetMs: 600, description: 'Transfer money to beneficiaries' },
  { id: 'fx', name: 'FX', p95TargetMs: 500, description: 'Quotes and currency conversions' },
  { id: 'wallets', name: 'Wallets', p95TargetMs: 400, description: 'Wallet balances, funding and transactions' },
];

const W = '/api/v1/client/{clientHashId}/customer/{customerHashId}/wallet/{walletHashId}';
const endpoints = [
  { id: 'ep_transfer_money', service: 'payouts', method: 'POST', path: `${W}/remittance`, name: 'Transfer money', docStatus: 'unverified', medianMs: 205, weight: 5 },
  { id: 'ep_add_beneficiary', service: 'payouts', method: 'POST', path: '/api/v2/client/{clientHashId}/customer/{customerHashId}/beneficiaries', name: 'Add beneficiary (v2)', docStatus: 'verified', medianMs: 240, weight: 2 },
  { id: 'ep_remit_audit', service: 'payouts', method: 'GET', path: `${W}/remittance/{systemReferenceNumber}/audit`, name: 'Transaction status', docStatus: 'unverified', medianMs: 110, weight: 3 },
  { id: 'ep_fx_quote', service: 'fx', method: 'POST', path: '/api/v1/client/{clientHashId}/quotes', name: 'Create quote', docStatus: 'verified', medianMs: 130, weight: 4 },
  { id: 'ep_fx_conversion', service: 'fx', method: 'POST', path: '/api/v1/client/{clientHashId}/conversions', name: 'Create conversion', docStatus: 'unverified', medianMs: 260, weight: 2 },
  { id: 'ep_wallet_balance', service: 'wallets', method: 'GET', path: W, name: 'Wallet balance', docStatus: 'unverified', medianMs: 85, weight: 5 },
  { id: 'ep_wallet_txns', service: 'wallets', method: 'GET', path: `${W}/transactions`, name: 'Wallet transactions', docStatus: 'unverified', medianMs: 150, weight: 3 },
  { id: 'ep_wallet_fund', service: 'wallets', method: 'POST', path: `${W}/fund`, name: 'Fund wallet', docStatus: 'unverified', medianMs: 190, weight: 1 },
  { id: 'ep_payment_create', service: 'payments', method: 'POST', path: `${W}/payments`, name: 'Create payment', docStatus: 'illustrative', medianMs: 220, weight: 3 },
  { id: 'ep_payment_get', service: 'payments', method: 'GET', path: '/api/v1/client/{clientHashId}/payments/{paymentId}', name: 'Get payment', docStatus: 'illustrative', medianMs: 105, weight: 2 },
];
const weightTotal = endpoints.reduce((s, e) => s + e.weight, 0);

// Dashboard-specific error catalogue (labels are prototype vocabulary, not official Nium codes).
const errors = {
  validation: [
    { httpStatus: 400, errorCode: 'VALIDATION_FAILED', errorSummary: 'beneficiaryAccountNumber failed format validation' },
    { httpStatus: 400, errorCode: 'VALIDATION_FAILED', errorSummary: 'Missing required field: purposeCode' },
    { httpStatus: 400, errorCode: 'VALIDATION_FAILED', errorSummary: 'destinationCurrency not supported for corridor' },
    { httpStatus: 422, errorCode: 'INSUFFICIENT_BALANCE', errorSummary: 'Wallet balance lower than sourceAmount' },
    { httpStatus: 409, errorCode: 'DUPLICATE_REQUEST', errorSummary: 'x-request-id already used for a different payload' },
  ],
  auth: [
    { httpStatus: 401, errorCode: 'AUTH_INVALID_KEY', errorSummary: 'x-api-key missing or invalid for this environment' },
    { httpStatus: 403, errorCode: 'AUTH_FORBIDDEN', errorSummary: 'Client not enabled for this product in Sandbox' },
  ],
  rateLimit: [{ httpStatus: 429, errorCode: 'RATE_LIMITED', errorSummary: 'Sandbox limit exceeded (50 requests/second)' }],
  server: [
    { httpStatus: 500, errorCode: 'UPSTREAM_ERROR', errorSummary: 'Internal error while processing request' },
    { httpStatus: 502, errorCode: 'PARTNER_UNAVAILABLE', errorSummary: 'Payout partner returned an invalid response' },
    { httpStatus: 503, errorCode: 'SERVICE_UNAVAILABLE', errorSummary: 'Service temporarily unavailable' },
  ],
  timeout: [{ httpStatus: 504, errorCode: 'GATEWAY_TIMEOUT', errorSummary: 'No response from downstream service within 30s' }],
};

const customers = [
  { id: 'acme_demo', name: 'Acme (demo)', region: 'US', onboardingStage: 'production_live', environments: ['sandbox', 'production'], webhookHost: 'hooks.acme-demo.example', brand: { accent: '#3D7BFF' } },
  { id: 'airbnb_demo', name: 'Airbnb (demo)', region: 'SG', onboardingStage: 'production_live', environments: ['sandbox', 'production'], webhookHost: 'webhooks.airbnb-demo.example', brand: { accent: '#FF5A7A' } },
  { id: 'initech_demo', name: 'Initech (demo)', region: 'GB', onboardingStage: 'sandbox_setup', environments: ['sandbox'], webhookHost: 'hooks.initech-demo.example', brand: { accent: '#22D3EE' } },
];

// Scenario knobs per customer/environment. dailyVolume is requests per 24 h; rates are per-request probabilities.
const scenarios = {
  'acme_demo:production': { dailyVolume: 32000, validation: 0.006, auth: 0.0005, server: 0.0015, timeout: 0.0004, slow: 0.004, webhookFailureRate: 0.014,
    incidents: [{ service: 'fx', fromH: 3.5, toH: 1.5, latencyX: 2.6, label: 'FX quote latency degradation' }] },
  'acme_demo:sandbox': { dailyVolume: 3600, validation: 0.06, auth: 0.012, server: 0.003, timeout: 0, slow: 0.005,
    rateLimitBurst: { atH: 5.2, count: 60 } },
  'airbnb_demo:production': { dailyVolume: 48000, validation: 0.005, auth: 0, server: 0.0015, timeout: 0.0004, slow: 0.004,
    incidents: [{ service: 'payouts', fromH: 0.75, toH: 0.1, server: 0.11, timeout: 0.035, label: 'Payout partner errors' }] },
  'airbnb_demo:sandbox': { dailyVolume: 1600, validation: 0.03, auth: 0.008, server: 0.001, timeout: 0, slow: 0.004,
    missingServices: ['wallets'], staleServices: { payments: 3.2 } },
  'initech_demo:sandbox': { dailyVolume: 0 },
};

// Diurnal weight per bucket: busier during the anchor day's business hours.
const diurnal = Array.from({ length: BUCKETS }, (_, b) => {
  const hourOfDay = new Date(START + b * BUCKET_MIN * 60_000).getUTCHours() + 0.5;
  return 0.45 + 0.55 * Math.sin(((hourOfDay - 2) / 24) * Math.PI) ** 2;
});
const diurnalSum = diurnal.reduce((s, w) => s + w, 0);

const requests = [];
const webhooks = [];
const metricSeries = [];
const webhookSeries = [];
const telemetrySources = [];
let reqSeq = 0;
let whSeq = 0;

// Simulates the webhook events for one accepted payout and counts them into the webhook aggregates.
function simulateWebhooks(transactionStatus, ts, sc, whPoints) {
  const events = [['REMIT_TRANSACTION_INITIATED_WEBHOOK', 2]];
  if (transactionStatus === 'PAID') events.push(['REMIT_TRANSACTION_PAID_WEBHOOK', 8 + rand() * 30]);
  if (transactionStatus === 'FAILED') events.push(['REMIT_TRANSACTION_FAILED_WEBHOOK', 4 + rand() * 20]);
  if (transactionStatus === 'RETURNED') events.push(['REMIT_TRANSACTION_RETURNED_WEBHOOK', 60 + rand() * 120]);
  const out = [];
  for (const [template, minutesAfter] of events) {
    const at = ts + Math.floor(minutesAfter * 60_000);
    if (at > ANCHOR) continue;
    const failP = sc.webhookFailureRate ?? 0.004;
    const f = rand();
    let deliveryStatus = 'delivered';
    let attempts = 1;
    let responseStatus = 200;
    let deliveryLatencyMs = 120 + Math.floor(rand() * 260);
    if (f < failP) { deliveryStatus = 'failed'; attempts = 5; responseStatus = pick([500, 503, 404]); deliveryLatencyMs = null; }
    else if (f < failP * 2.2) { deliveryStatus = 'delayed'; attempts = 2 + Math.floor(rand() * 2); deliveryLatencyMs = 45_000 + Math.floor(rand() * 240_000); }
    const b = Math.floor((at - START) / (BUCKET_MIN * 60_000));
    const p = (whPoints[b] ??= [b, 0, 0, 0, 0]);
    p[1]++;
    p[deliveryStatus === 'delivered' ? 2 : deliveryStatus === 'delayed' ? 3 : 4]++;
    out.push({ template, at, deliveryStatus, attempts, responseStatus, deliveryLatencyMs });
  }
  return out;
}

for (const c of customers) {
  for (const env of c.environments) {
    const sc = scenarios[`${c.id}:${env}`];
    const missing = new Set(sc.missingServices ?? []);
    const stale = sc.staleServices ?? {};
    const lastEvent = {};
    for (const s of services) {
      telemetrySources.push({
        customerId: c.id, environment: env, service: s.id,
        status: sc.dailyVolume === 0 || missing.has(s.id) ? 'missing' : stale[s.id] ? 'stale' : 'live',
        lastEventAt: null,
        note: missing.has(s.id) ? 'Log shipper not reporting for this service in Sandbox (synthetic scenario)'
          : stale[s.id] ? 'No new telemetry received for over 3 hours (synthetic scenario)'
            : sc.dailyVolume === 0 ? 'No API traffic received yet for this environment' : null,
      });
    }
    if (!sc.dailyVolume) continue;
    const whPoints = [];
    for (const ep of endpoints) {
      if (missing.has(ep.service)) continue;
      const points = [];
      for (let b = 0; b < BUCKETS; b++) {
        const bucketStart = START + b * BUCKET_MIN * 60_000;
        const hoursAgoEnd = (ANCHOR - (bucketStart + BUCKET_MIN * 60_000)) / HOUR;
        if (stale[ep.service] && hoursAgoEnd < stale[ep.service]) continue;
        const expected = (sc.dailyVolume * (ep.weight / weightTotal) * diurnal[b]) / diurnalSum;
        let n = Math.max(0, Math.round(expected * (1 + 0.12 * normal())));
        const burst = sc.rateLimitBurst && ep.id === 'ep_fx_quote' && Math.abs((ANCHOR - bucketStart) / HOUR - sc.rateLimitBurst.atH) < BUCKET_MIN / 120 ? sc.rateLimitBurst.count : 0;
        n += burst;
        if (n === 0) continue;
        const pt = [b, 0, 0, 0, 0, 0, 0, ...LATENCY_BINS.map(() => 0)]; // [b, total, client, server, timeout, slow, asyncPayoutFail, ...hist]
        const batch = [];
        for (let i = 0; i < n; i++) {
          const ts = bucketStart + Math.floor(rand() * BUCKET_MIN * 60_000);
          const hoursAgo = (ANCHOR - ts) / HOUR;
          const incident = (sc.incidents ?? []).find((x) => x.service === ep.service && hoursAgo <= x.fromH && hoursAgo >= x.toH);
          const pServer = incident?.server ?? sc.server;
          const pTimeout = incident?.timeout ?? sc.timeout;
          let latency = lognormal(ep.medianMs * (env === 'sandbox' ? 1.15 : 1) * (incident?.latencyX ?? 1));
          if (rand() < sc.slow) latency = 1000 + Math.round(rand() * 1800); // occasional >1s outlier
          latency = Math.max(18, Math.min(latency, 9000));
          let err = null;
          let outcome = 'success';
          if (i < burst) { err = errors.rateLimit[0]; outcome = 'client_error'; latency = 22 + Math.floor(rand() * 15); }
          else {
            const r = rand();
            if (r < pTimeout) { err = errors.timeout[0]; outcome = 'timeout'; latency = 30000; }
            else if (r < pTimeout + pServer) { err = pick(errors.server); outcome = 'server_error'; latency = Math.round(latency * 1.4); }
            else if (r < pTimeout + pServer + sc.validation) { err = pick(errors.validation); outcome = 'client_error'; latency = Math.round(latency * 0.6); }
            else if (r < pTimeout + pServer + sc.validation + sc.auth) { err = pick(errors.auth); outcome = 'client_error'; latency = Math.round(30 + rand() * 40); }
          }
          batch.push({ ts, latency, err, outcome, incident });
        }
        batch.sort((a, x) => a.ts - x.ts);
        for (const rec of batch) {
          pt[1]++;
          if (rec.outcome === 'client_error') pt[2]++;
          if (rec.outcome === 'server_error') pt[3]++;
          if (rec.outcome === 'timeout') pt[4]++;
          if (rec.latency >= SLOW_MS) pt[5]++;
          pt[7 + binOf(rec.latency)]++;
          let transactionStatus = null;
          if (ep.id === 'ep_transfer_money' && rec.outcome === 'success') {
            // Most accepted payouts are paid; a small share fail or are returned later, asynchronously.
            const q = rand();
            transactionStatus = q < 0.006 ? 'FAILED' : q < 0.009 ? 'RETURNED' : rec.ts > ANCHOR - 0.4 * HOUR ? 'INITIATED' : 'PAID';
            if (transactionStatus === 'FAILED' || transactionStatus === 'RETURNED') pt[6]++;
          }
          const wh = transactionStatus ? simulateWebhooks(transactionStatus, rec.ts, sc, whPoints) : [];
          const retention = rec.outcome !== 'success' ? 'error'
            : transactionStatus === 'FAILED' || transactionStatus === 'RETURNED' ? 'payout_failed'
              : rec.latency >= SLOW_MS ? 'slow'
                : wh.some((w) => w.deliveryStatus !== 'delivered') ? 'webhook_issue'
                  : rand() < SUCCESS_SAMPLE_RATE ? 'sampled' : null;
          lastEvent[ep.service] = rec.ts;
          if (!retention) continue;
          reqSeq++;
          const row = {
            requestId: `req_demo_${String(reqSeq).padStart(6, '0')}`,
            xRequestId: uuid(),
            traceId: `demo-trace-${hex(8)}`,
            customerId: c.id, environment: env, service: ep.service, endpointId: ep.id,
            method: ep.method, endpoint: ep.path, timestamp: iso(rec.ts),
            httpStatus: rec.err?.httpStatus ?? (ep.method === 'POST' && ep.id !== 'ep_fx_quote' ? 201 : 200),
            latencyMs: rec.latency, outcome: rec.outcome,
            errorCode: rec.err?.errorCode ?? null, errorSummary: rec.err?.errorSummary ?? null,
            traceAvailable: !(rec.outcome === 'timeout' && rand() < 0.5) && rand() > 0.015,
            region: pick(['ap-southeast-1', 'eu-west-1', 'us-east-1']),
            systemReferenceNumber: transactionStatus ? `RT${String(1000000 + reqSeq * 7)}` : null,
            transactionStatus, incident: rec.incident?.label ?? null, retention, synthetic: true,
          };
          requests.push(row);
          for (const w of wh) {
            if (w.deliveryStatus === 'delivered' && rand() >= SUCCESS_SAMPLE_RATE) continue;
            whSeq++;
            webhooks.push({
              webhookId: `wh_demo_${String(whSeq).padStart(6, '0')}`, customerId: c.id, environment: env, service: 'payouts',
              template: w.template, relatedRequestId: row.requestId, systemReferenceNumber: row.systemReferenceNumber,
              timestamp: iso(w.at), deliveryStatus: w.deliveryStatus, attempts: w.attempts, customerEndpointHost: c.webhookHost,
              responseStatus: w.responseStatus, deliveryLatencyMs: w.deliveryLatencyMs,
              retention: w.deliveryStatus === 'delivered' ? 'sampled' : 'problem', synthetic: true,
            });
          }
        }
        points.push(pt);
      }
      if (points.length) metricSeries.push({ customerId: c.id, environment: env, endpointId: ep.id, service: ep.service, points });
    }
    webhookSeries.push({ customerId: c.id, environment: env, service: 'payouts', points: whPoints.filter(Boolean) });
    for (const t of telemetrySources.filter((t) => t.customerId === c.id && t.environment === env)) {
      t.lastEventAt = lastEvent[t.service] ? iso(lastEvent[t.service]) : null;
    }
  }
}
requests.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
webhooks.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

const alerts = [
  { alertId: 'alert_demo_001', name: 'Payout error rate above 5%', customerId: 'airbnb_demo', environment: 'production', service: 'payouts', metric: 'error_rate', comparator: '>=', threshold: 5, unit: '%', evaluationWindowMin: 15, severity: 'critical', destination: 'slack_simulated', enabled: true, state: 'triggered', lastTriggeredAt: '2026-10-17T11:24:00Z', triggerCount24h: 3, synthetic: true },
  { alertId: 'alert_demo_002', name: 'FX P95 latency above 500 ms', customerId: 'acme_demo', environment: 'production', service: 'fx', metric: 'p95_latency', comparator: '>', threshold: 500, unit: 'ms', evaluationWindowMin: 30, severity: 'warning', destination: 'email_simulated', enabled: true, state: 'recovered', lastTriggeredAt: '2026-10-17T10:31:00Z', triggerCount24h: 1, synthetic: true },
  { alertId: 'alert_demo_003', name: 'Webhook delivery below 97%', customerId: 'acme_demo', environment: 'production', service: 'payouts', metric: 'webhook_success_rate', comparator: '<', threshold: 97, unit: '%', evaluationWindowMin: 60, severity: 'warning', destination: 'pagerduty_simulated', enabled: true, state: 'triggered', lastTriggeredAt: '2026-10-17T10:05:00Z', triggerCount24h: 2, synthetic: true },
  { alertId: 'alert_demo_004', name: 'Sandbox auth failures', customerId: 'acme_demo', environment: 'sandbox', service: 'all', metric: 'error_count', comparator: '>=', threshold: 10, unit: 'requests', evaluationWindowMin: 60, severity: 'info', destination: 'email_simulated', enabled: false, state: 'disabled', lastTriggeredAt: null, triggerCount24h: 0, synthetic: true },
];

const dataset = {
  meta: {
    name: 'Nium API Health Monitor — synthetic demo dataset',
    schemaVersion: '2.0.0',
    generatedAt: iso(ANCHOR),
    anchorTime: iso(ANCHOR),
    windowHours: 24,
    synthetic: true,
    disclaimer: 'Demo data / synthetic telemetry. Not real Nium traffic, customer data, or measured Nium performance. Customer names (Acme, Airbnb, Initech) are illustrative placeholders.',
    retention: {
      metrics: 'Every request is counted in 5-minute aggregates with latency histograms.',
      requests: `All failed and slow (≥${SLOW_MS} ms) requests, payouts that later failed or had webhook problems, and a ${SUCCESS_SAMPLE_RATE * 100}% sample of other successful requests.`,
      webhooks: `All failed and delayed deliveries plus a ${SUCCESS_SAMPLE_RATE * 100}% sample of delivered ones, for retained requests.`,
      successSampleRate: SUCCESS_SAMPLE_RATE,
    },
    sources: [
      'https://docs.nium.com/docs/developers',
      'https://docs.nium.com/docs/developers/notifications-and-webhooks',
      'https://docs.nium.com/docs/developers/nium-api/usage-limits',
    ],
    documentedFacts: {
      sandboxRateLimits: { perSecond: 50, burstPerSecond: 50, perDay: 25000, source: 'Nium usage limits page (sandbox only; production limits not published)' },
      requestIdHeader: 'x-request-id (36-character UUID, sent on every request)',
      verifiedWebhookTemplates: ['REMIT_TRANSACTION_INITIATED_WEBHOOK', 'REMIT_TRANSACTION_PAID_WEBHOOK'],
      unverifiedWebhookTemplates: ['REMIT_TRANSACTION_FAILED_WEBHOOK', 'REMIT_TRANSACTION_RETURNED_WEBHOOK'],
    },
  },
  services,
  endpoints: endpoints.map(({ weight, medianMs, ...e }) => e),
  customers,
  telemetrySources,
  metrics: {
    bucketMinutes: BUCKET_MIN,
    bucketCount: BUCKETS,
    windowStart: iso(START),
    latencyBinsMs: LATENCY_BINS,
    pointColumns: ['bucket', 'total', 'clientErrors', 'serverErrors', 'timeouts', 'slow', 'asyncPayoutFailures', 'histogram (one count per latencyBinsMs entry)'],
    series: metricSeries,
  },
  webhookMetrics: { bucketMinutes: BUCKET_MIN, pointColumns: ['bucket', 'total', 'delivered', 'delayed', 'failed'], series: webhookSeries },
  requests,
  webhooks,
  alerts,
};

// Pretty-print, but keep numeric point arrays on one line so the file stays readable and compact.
const text = JSON.stringify(dataset, null, 2).replace(/\[\s+((?:-?\d+,\s*)*-?\d+)\s+\]/g, (_, nums) => `[${nums.replace(/\s+/g, '')}]`);
writeFileSync(join(root, 'data/nium-dashboard-mock-data.json'), text + '\n');
const total = metricSeries.reduce((s, x) => s + x.points.reduce((n, p) => n + p[1], 0), 0);
console.log(`Simulated ${total.toLocaleString('en-US')} requests. Retained ${requests.length} request records and ${webhooks.length} webhook records. ${(text.length / 1e6).toFixed(2)} MB.`);
