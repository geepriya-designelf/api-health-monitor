// Rule-based triage: turns a failed or slow request into a likely cause, an owner and next steps.
// Suggestions are heuristics over synthetic data. They point engineers at the right evidence;
// they never replace reading the trace.
import { dataset } from './repository';
import { SLOW_MS, successBetween } from './selectors';
import type { ApiRequest } from './types';

export type Owner = 'customer' | 'nium_backend' | 'payout_partner' | 'nium_account';
export const OWNER_LABEL: Record<Owner, string> = {
  customer: 'Customer integration',
  nium_backend: 'Nium backend engineering',
  payout_partner: 'Payout partner (via Nium payout ops)',
  nium_account: 'Nium product / account team',
};

export interface Diagnosis {
  needsTriage: boolean;
  kind: 'client' | 'server' | 'timeout' | 'async_payout' | 'slow' | 'none';
  headline: string;
  likelyCause: string;
  owner: Owner;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  steps: string[];
  caution?: string;
  similar: ApiRequest[];
  incident: boolean;
}

const CLUSTER_WINDOW_MS = 30 * 60_000;
const epName = (id: string) => dataset.endpoints.find((e) => e.id === id)?.name ?? id;

const byCode: Record<string, Pick<Diagnosis, 'kind' | 'likelyCause' | 'owner' | 'confidence' | 'steps' | 'caution'>> = {
  VALIDATION_FAILED: {
    kind: 'client', owner: 'customer', confidence: 'high',
    likelyCause: 'The request body did not pass Nium validation. This is a payload problem on the customer side, not a service fault.',
    steps: ['Compare the failing field against the API reference for this endpoint', 'Check corridor rules for the destination currency and beneficiary country', 'Fix the payload and resend with a new x-request-id'],
  },
  INSUFFICIENT_BALANCE: {
    kind: 'client', owner: 'customer', confidence: 'high',
    likelyCause: 'The wallet did not hold enough funds for the source amount at request time.',
    steps: ['Check the wallet balance for the source currency', 'Fund the wallet or lower the amount', 'Resend with a new x-request-id'],
  },
  DUPLICATE_REQUEST: {
    kind: 'client', owner: 'customer', confidence: 'high',
    likelyCause: 'An x-request-id was reused with a different payload. The client is likely recycling ids on retry.',
    steps: ['Generate a fresh UUID for every new request', 'Reuse the same x-request-id only when retrying the identical payload'],
  },
  AUTH_INVALID_KEY: {
    kind: 'client', owner: 'customer', confidence: 'high',
    likelyCause: 'The x-api-key is missing or belongs to the other environment. Sandbox keys do not work in Production.',
    steps: ['Confirm the key matches this environment', 'Rotate the key if it may have leaked', 'Check the client sends x-api-key and x-client-name on every call'],
  },
  AUTH_FORBIDDEN: {
    kind: 'client', owner: 'nium_account', confidence: 'medium',
    likelyCause: 'The client is authenticated but this product is not enabled for it in this environment.',
    steps: ['Confirm which products the customer has been enabled for', 'Ask the account team to enable the product, then retest'],
  },
  RATE_LIMITED: {
    kind: 'client', owner: 'customer', confidence: 'high',
    likelyCause: 'The client exceeded the Sandbox limit of 50 requests per second, usually from a load test or a tight retry loop.',
    steps: ['Add exponential backoff with jitter on 429', 'Spread load tests over time or request a higher limit', 'Check the 25,000 requests per day Sandbox cap'],
  },
  UPSTREAM_ERROR: {
    kind: 'server', owner: 'nium_backend', confidence: 'medium',
    likelyCause: 'An unhandled error inside the Nium service. The request itself looks valid.',
    steps: ['Open the trace and find the failing span', 'Escalate to backend engineering with the handoff summary', 'Retry once with the same x-request-id if the operation is idempotent'],
  },
  PARTNER_UNAVAILABLE: {
    kind: 'server', owner: 'payout_partner', confidence: 'medium',
    likelyCause: 'The downstream payout partner returned an invalid or empty response.',
    steps: ['Check whether other payouts on the same corridor are failing', 'Escalate to payout ops with the corridor and systemReferenceNumber if present', 'Confirm the transaction status before any retry'],
    caution: 'Do not blindly retry a payout. Check its status first so the beneficiary is not paid twice.',
  },
  SERVICE_UNAVAILABLE: {
    kind: 'server', owner: 'nium_backend', confidence: 'medium',
    likelyCause: 'The service was briefly unavailable, often during a deploy or under load shedding.',
    steps: ['Check whether the error repeats after a short wait', 'Escalate if it persists for more than a few minutes'],
  },
  GATEWAY_TIMEOUT: {
    kind: 'timeout', owner: 'nium_backend', confidence: 'medium',
    likelyCause: 'No downstream response within 30 seconds. The outcome is unknown: the operation may or may not have completed.',
    steps: ['Query the transaction or resource status before retrying', 'Open the trace to see which dependency stalled', 'Escalate with the handoff summary if several timeouts cluster together'],
    caution: 'A timeout is not a failure confirmation. For payouts, check the status first to avoid a duplicate transfer.',
  },
};

// Cheap check used for counts and badges; full diagnosis runs only for the row being viewed.
export const needsTriage = (r: ApiRequest) => r.outcome !== 'success' || r.transactionStatus === 'FAILED' || r.transactionStatus === 'RETURNED';

export function diagnose(r: ApiRequest, scopeRows: ApiRequest[]): Diagnosis {
  const t = Date.parse(r.timestamp);
  const near = (x: ApiRequest) => Math.abs(Date.parse(x.timestamp) - t) <= CLUSTER_WINDOW_MS && x.requestId !== r.requestId;
  const asyncFail = r.transactionStatus === 'FAILED' || r.transactionStatus === 'RETURNED';

  if (r.outcome === 'success' && !asyncFail) {
    if (r.latencyMs >= SLOW_MS) {
      const svc = dataset.services.find((s) => s.id === r.service);
      const slowPeers = scopeRows.filter((x) => near(x) && x.endpointId === r.endpointId && x.latencyMs >= SLOW_MS);
      return {
        needsTriage: false, kind: 'slow', headline: `Slow response on ${epName(r.endpointId)}`,
        likelyCause: slowPeers.length ? 'Several slow calls on this endpoint at the same time, which points to a service side slowdown.' : 'An isolated latency outlier. The call succeeded.',
        owner: slowPeers.length ? 'nium_backend' : 'customer', confidence: 'low',
        evidence: [`${r.latencyMs.toLocaleString('en-US')} ms against a P95 target of ${svc?.p95TargetMs} ms`, `${slowPeers.length} other slow calls on this endpoint within 30 min`],
        steps: ['Open the trace to find the slowest span', 'Watch for a pattern before escalating'], similar: slowPeers, incident: false,
      };
    }
    return { needsTriage: false, kind: 'none', headline: 'Request succeeded', likelyCause: '', owner: 'customer', confidence: 'high', evidence: [], steps: [], similar: [], incident: false };
  }

  if (asyncFail) {
    const peers = scopeRows.filter((x) => near(x) && (x.transactionStatus === 'FAILED' || x.transactionStatus === 'RETURNED'));
    const returned = r.transactionStatus === 'RETURNED';
    return {
      needsTriage: true, kind: 'async_payout',
      headline: returned ? 'Payout returned after it was sent' : 'Payout accepted, then failed',
      likelyCause: returned
        ? 'The beneficiary bank sent the funds back, usually because of a closed account or a name mismatch.'
        : 'The API accepted the transfer, but it failed during processing. Typical reasons are a beneficiary bank rejection or a compliance hold.',
      owner: 'payout_partner', confidence: 'medium',
      evidence: [`HTTP ${r.httpStatus} on create, then status ${r.transactionStatus}`, `systemReferenceNumber ${r.systemReferenceNumber}`, `${peers.length} other failed or returned payouts within 30 min`],
      steps: ['Check the failure reason in the payout status (audit) endpoint', 'Confirm the customer received the status webhook', 'Verify the beneficiary details with the customer before resending'],
      similar: peers, incident: peers.length >= 6,
    };
  }

  const base = byCode[r.errorCode ?? ''] ?? byCode.UPSTREAM_ERROR;
  const serverSideRow = (x: ApiRequest) => x.outcome === 'server_error' || x.outcome === 'timeout';
  // Server-side failures cluster by service (mixed 5xx/504 codes are usually one incident); client errors by exact code.
  const similar = scopeRows.filter((x) => near(x) && x.service === r.service && (serverSideRow(r) ? serverSideRow(x) : x.errorCode === r.errorCode));
  // Successful calls come from the full metrics, not the sampled log.
  const sameEndpointOk = successBetween({ customerId: r.customerId, environment: r.environment, range: '24h' }, r.endpointId, t - CLUSTER_WINDOW_MS, t + CLUSTER_WINDOW_MS);
  const serverSide = base.kind === 'server' || base.kind === 'timeout';
  // At production volume a couple of background errors per 30 min is normal; a cluster needs more.
  const incident = serverSide && similar.length >= 5;
  const evidence = [
    `HTTP ${r.httpStatus} · ${r.errorCode}: ${r.errorSummary}`,
    `${similar.length} other ${serverSideRow(r) ? 'server-side failures' : `${r.errorCode} errors`} on ${dataset.services.find((s) => s.id === r.service)?.name} within 30 min`,
    `${sameEndpointOk.toLocaleString('en-US')} successful calls to the same endpoint in that window`,
  ];
  if (!r.traceAvailable) evidence.push('Trace not retained. Use x-request-id and timestamp for log search.');
  return {
    needsTriage: true, kind: base.kind,
    headline: incident ? `Part of a cluster: ${similar.length + 1} ${dataset.services.find((s) => s.id === r.service)?.name} failures in 30 min` : `${epName(r.endpointId)} failed with ${r.errorCode}`,
    likelyCause: incident ? `${base.likelyCause} The cluster suggests an ongoing incident rather than a one-off.` : base.likelyCause,
    owner: base.owner, confidence: incident ? 'high' : base.confidence, evidence,
    steps: base.steps, caution: base.caution, similar, incident,
  };
}
