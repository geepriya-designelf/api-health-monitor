// Types for the synthetic dataset (see data/README.md for the full data dictionary).
export type Environment = 'sandbox' | 'production';
export type ServiceId = 'payouts' | 'payments' | 'fx' | 'wallets';
export type Outcome = 'success' | 'client_error' | 'server_error' | 'timeout';
export type HealthStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';
export type TelemetryStatus = 'live' | 'stale' | 'missing';
export type TimeRange = '90m' | '3h' | '8h' | '24h';

export interface Service { id: ServiceId; name: string; p95TargetMs: number; description: string }
export interface Endpoint { id: string; service: ServiceId; method: string; path: string; name: string; docStatus: 'verified' | 'unverified' | 'illustrative' }
export interface Customer {
  id: string; name: string; region: string; onboardingStage: string;
  environments: Environment[]; webhookHost: string; brand: { accent: string };
}
export interface TelemetrySource {
  customerId: string; environment: Environment; service: ServiceId;
  status: TelemetryStatus; lastEventAt: string | null; note: string | null;
}
export interface ApiRequest {
  requestId: string; xRequestId: string; traceId: string; customerId: string; environment: Environment;
  service: ServiceId; endpointId: string; method: string; endpoint: string; timestamp: string;
  httpStatus: number; latencyMs: number; outcome: Outcome; errorCode: string | null; errorSummary: string | null;
  traceAvailable: boolean; region: string; systemReferenceNumber: string | null;
  transactionStatus: 'INITIATED' | 'PAID' | 'FAILED' | 'RETURNED' | null; incident: string | null;
  retention: 'error' | 'slow' | 'payout_failed' | 'webhook_issue' | 'sampled'; synthetic: true;
}
export interface WebhookDelivery {
  webhookId: string; customerId: string; environment: Environment; service: ServiceId; template: string;
  relatedRequestId: string; systemReferenceNumber: string | null; timestamp: string;
  deliveryStatus: 'delivered' | 'delayed' | 'failed'; attempts: number; customerEndpointHost: string;
  responseStatus: number; deliveryLatencyMs: number | null; retention: 'problem' | 'sampled'; synthetic: true;
}
export interface AlertConfig {
  alertId: string; name: string; customerId: string; environment: Environment; service: ServiceId | 'all';
  metric: 'error_rate' | 'p95_latency' | 'webhook_success_rate' | 'error_count' | 'payout_failures';
  comparator: '>' | '>=' | '<' | '<='; threshold: number; unit: string; evaluationWindowMin: number;
  severity: 'critical' | 'warning' | 'info'; destination: string; enabled: boolean;
  state: 'ok' | 'triggered' | 'recovered' | 'disabled'; lastTriggeredAt: string | null; triggerCount24h: number; synthetic: true;
}
// Metric point: [bucket, total, clientErrors, serverErrors, timeouts, slow, asyncPayoutFailures, ...histogram]
export type MetricPoint = number[];
export interface MetricSeries { customerId: string; environment: Environment; endpointId: string; service: ServiceId; points: MetricPoint[] }
// Webhook point: [bucket, total, delivered, delayed, failed]
export interface WebhookSeries { customerId: string; environment: Environment; service: ServiceId; points: number[][] }
export interface Dataset {
  meta: {
    name: string; schemaVersion: string; generatedAt: string; anchorTime: string; windowHours: number; synthetic: true; disclaimer: string;
    retention: { metrics: string; requests: string; webhooks: string; successSampleRate: number };
    sources: string[]; documentedFacts: Record<string, unknown>;
  };
  services: Service[]; endpoints: Endpoint[]; customers: Customer[]; telemetrySources: TelemetrySource[];
  metrics: { bucketMinutes: number; bucketCount: number; windowStart: string; latencyBinsMs: number[]; pointColumns: string[]; series: MetricSeries[] };
  webhookMetrics: { bucketMinutes: number; pointColumns: string[]; series: WebhookSeries[] };
  requests: ApiRequest[]; webhooks: WebhookDelivery[]; alerts: AlertConfig[];
}
