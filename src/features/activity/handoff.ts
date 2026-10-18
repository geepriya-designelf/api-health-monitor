import { dataset } from '../../data/repository';
import type { ApiRequest } from '../../data/types';

// Plain-text summary an integration engineer can paste into a ticket or chat.
export function handoffText(r: ApiRequest) {
  const c = dataset.customers.find((x) => x.id === r.customerId);
  const ep = dataset.endpoints.find((e) => e.id === r.endpointId);
  return [
    `[Synthetic demo] ${ep?.name ?? r.endpoint} ${r.outcome.replace('_', ' ')}`,
    `Customer: ${c?.name} · ${r.environment}`,
    `Trace ID: ${r.traceId}${r.traceAvailable ? '' : ' (trace details unavailable)'}`,
    `x-request-id: ${r.xRequestId}`,
    `Request: ${r.method} ${r.endpoint}`,
    `Time: ${r.timestamp}`,
    `Status: HTTP ${r.httpStatus}${r.errorCode ? ` · ${r.errorCode}` : ''}`,
    r.errorSummary ? `Error: ${r.errorSummary}` : null,
    `Latency: ${r.latencyMs} ms · Region: ${r.region}`,
    r.systemReferenceNumber ? `systemReferenceNumber: ${r.systemReferenceNumber} (${r.transactionStatus})` : null,
  ].filter(Boolean).join('\n');
}
