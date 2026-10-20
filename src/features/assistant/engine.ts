// Rule-based investigation assistant. It answers from the retained request log and the triage rules;
// no model or external service is involved, so every answer can be traced back to the data.
import { dataset } from '../../data/repository';
import { RANGE_LABEL, scopedRequests, serviceHealth, type Scope } from '../../data/selectors';
import { diagnose, needsTriage, OWNER_LABEL, type Diagnosis } from '../../data/triage';
import type { ApiRequest } from '../../data/types';
import { fmtMs, fmtTime } from '../../utils/format';

export type ActionKind = 'open_in_table' | 'copy_handoff' | 'escalate' | 'resolve' | 'investigate';
export interface BotAction { label: string; kind: ActionKind; primary?: boolean }
export interface BotReply { text: string; bullets?: string[]; request?: ApiRequest; diagnosis?: Diagnosis; caution?: string; actions?: BotAction[]; suggestions?: string[] }

const TRACE_RE = /\b(?:dt|demo-trace)-[0-9a-f]{8}\b/i;
// Trace IDs show as dt-xxxxxxxx in the UI; the log stores demo-trace-xxxxxxxx.
export const shortTrace = (id: string) => id.replace('demo-trace-', 'dt-');
const UUIDISH_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const custName = (id: string) => dataset.customers.find((c) => c.id === id)?.name ?? id;
const svcName = (id: string) => dataset.services.find((s) => s.id === id)?.name ?? id;
const epName = (id: string) => dataset.endpoints.find((e) => e.id === id)?.name ?? id;
const envName = (e: string) => (e === 'sandbox' ? 'Sandbox' : 'Production');

export const OPENING_SUGGESTIONS = ['What is failing right now?', 'Is it safe to retry a timed-out payout?', 'How do I find a request?'];

export function findRequest(text: string, scope: Scope): { r?: ApiRequest; elsewhere?: boolean; token?: string } {
  const token = text.match(TRACE_RE)?.[0] ?? text.match(UUIDISH_RE)?.[0] ?? text.trim().split(/\s+/).find((w) => /^req_|^[0-9a-f]{12,}$/i.test(w));
  if (!token) return {};
  const t = token.toLowerCase();
  const match = (r: ApiRequest) => shortTrace(r.traceId).toLowerCase() === shortTrace(t) || r.xRequestId.toLowerCase() === t || r.requestId.toLowerCase() === t;
  const inScope = scopedRequests(scope).find(match);
  if (inScope) return { r: inScope, token };
  const anywhere = dataset.requests.find(match);
  return anywhere ? { r: anywhere, elsewhere: true, token } : { token };
}

function summarise(r: ApiRequest, d: Diagnosis, elsewhere: boolean): BotReply {
  const where = elsewhere ? ` It belongs to ${custName(r.customerId)} · ${envName(r.environment)}, not the view you have open.` : '';
  if (!d.needsTriage && d.kind === 'none') {
    return {
      text: `Good news: ${shortTrace(r.traceId)} succeeded. ${r.method} ${epName(r.endpointId)} returned HTTP ${r.httpStatus} in ${fmtMs(r.latencyMs)} at ${fmtTime(r.timestamp)}.${where}`,
      request: r, actions: [{ label: 'Open in API activity', kind: 'open_in_table' }],
      suggestions: ['What is failing right now?'],
    };
  }
  const selfServe = d.owner === 'customer';
  return {
    text: `${d.headline}.${where} ${d.likelyCause}`,
    request: r, diagnosis: d, caution: d.caution,
    bullets: [`Suggested owner: ${OWNER_LABEL[d.owner]} (${d.confidence} confidence)`, selfServe ? 'You can likely resolve this with the customer, without involving backend.' : `This one sits with ${OWNER_LABEL[d.owner]}. I can draft the handoff when you are ready.`],
    actions: [{ label: 'Open in API activity', kind: 'open_in_table' }, { label: 'Copy handoff', kind: 'copy_handoff' }],
    suggestions: ['What should I do next?', 'Is it safe to retry?', d.similar.length ? `Show the ${d.similar.length} related failures` : 'Why did it fail?', selfServe ? 'Mark it resolved' : 'Escalate it'],
  };
}

export function respond(input: string, scope: Scope, focus: ApiRequest | null): { reply: BotReply; focus: ApiRequest | null } {
  const text = input.trim();
  const low = text.toLowerCase();
  const period = `the last ${RANGE_LABEL[scope.range]}`;
  const rows = scopedRequests(scope);

  // 1. A trace ID or request ID always wins: start a new investigation.
  const found = findRequest(text, scope);
  if (found.r) {
    const d = diagnose(found.r, found.elsewhere ? dataset.requests.filter((x) => x.customerId === found.r!.customerId && x.environment === found.r!.environment) : rows);
    return { reply: summarise(found.r, d, !!found.elsewhere), focus: found.r };
  }
  if (found.token && (TRACE_RE.test(text) || UUIDISH_RE.test(text))) {
    return {
      focus,
      reply: {
        text: `I can't find ${found.token} in the request log for any customer.`,
        bullets: ['Failed and slow requests are always kept, but only 1% of successful ones are sampled. If it succeeded, it may not be stored.', `Check the time range too. You're looking at ${period}.`, 'Try the x-request-id instead, or paste the full trace ID from the response headers.'],
        suggestions: ['What is failing right now?'],
      },
    };
  }

  const d = focus ? diagnose(focus, rows) : null;
  const has = (...w: string[]) => w.some((x) => low.includes(x));

  // 2. Follow-ups about the request in focus.
  if (focus && d) {
    if (has('retry', 'resend', 'safe')) {
      const payout = focus.service === 'payouts';
      const text = d.kind === 'timeout' ? `Not yet. A 504 means the outcome is unknown, so the ${payout ? 'payout may already be on its way' : 'operation may have completed'}.`
        : d.kind === 'client' ? 'Retrying the same payload will fail the same way. Fix the request first, then resend it with a new x-request-id.'
          : d.kind === 'async_payout' ? 'Do not resend blindly. The API accepted it, so check why it failed and confirm the beneficiary details with the customer first.'
            : d.incident ? 'Hold off. This failure is part of a cluster, so retries are likely to fail until the incident clears.'
              : 'Yes, once, with the same x-request-id so the API can de-duplicate it. If it fails again, escalate.';
      const bullets = d.kind === 'timeout' && payout ? [`Call Transaction status${focus.systemReferenceNumber ? ` for ${focus.systemReferenceNumber}` : ''} and check the state first.`, 'Only resend if the status shows it was never created.'] : undefined;
      return { focus, reply: { text, bullets, suggestions: ['What should I do next?', 'Escalate it'] } };
    }
    if (has('why', 'cause', 'reason', 'evidence')) return { focus, reply: { text: d.likelyCause, bullets: d.evidence, suggestions: ['What should I do next?', 'Is it safe to retry?'] } };
    if (has('next', 'what should', 'what do', 'steps', 'fix', 'how do i solve')) return { focus, reply: { text: 'Here is what I would do, in order:', bullets: d.steps, caution: d.caution, suggestions: ['Is it safe to retry?', d.owner === 'customer' ? 'Mark it resolved' : 'Escalate it'] } };
    if (has('related', 'similar', 'other', 'cluster', 'show the')) {
      if (!d.similar.length) return { focus, reply: { text: 'No related failures on this API in the 30 minutes around it. It looks like a one-off.', suggestions: ['What should I do next?'] } };
      return { focus, reply: { text: `${d.similar.length} related failures on the ${svcName(focus.service)} API within 30 minutes${d.incident ? ', which points to an incident rather than a one-off' : ''}. The most recent:`, bullets: d.similar.slice(0, 5).map((x) => `${shortTrace(x.traceId)} · ${fmtTime(x.timestamp)} · HTTP ${x.httpStatus} ${x.errorCode ?? ''}`), actions: [{ label: 'Open in API activity', kind: 'open_in_table' }], suggestions: [d.incident ? 'Escalate it' : 'What should I do next?'] } };
    }
    if (has('escalate', 'who', 'owner', 'backend', 'product team', 'hand')) {
      if (d.owner === 'customer') return { focus, reply: { text: `You probably don't need backend for this one. It's a ${focus.errorCode ?? 'request'} problem on the customer side.`, bullets: d.steps, actions: [{ label: 'Escalate anyway', kind: 'escalate' }, { label: 'Copy handoff', kind: 'copy_handoff' }], suggestions: ['Mark it resolved'] } };
      return { focus, reply: { text: `This one goes to ${OWNER_LABEL[d.owner]}. The handoff has the trace ID, x-request-id, error and timing, so they won't need to ask you again.`, actions: [{ label: `Escalate to ${OWNER_LABEL[d.owner]}`, kind: 'escalate', primary: true }, { label: 'Copy handoff', kind: 'copy_handoff' }] } };
    }
    if (has('resolve', 'resolved', 'fixed', 'done', 'close')) return { focus, reply: { text: `I'll mark ${shortTrace(focus.traceId)} as resolved${d.similar.length ? `, along with its ${d.similar.length} related failures` : ''}.`, actions: [{ label: d.similar.length ? `Resolve ${d.similar.length + 1} requests` : 'Mark resolved', kind: 'resolve', primary: true }] } };
  }

  // 3. Scope-level questions.
  if (has('failing', 'wrong', 'health', 'status', 'incident', 'broken', 'down')) {
    const health = serviceHealth(scope);
    const bad = health.filter((h) => h.status === 'critical' || h.status === 'degraded');
    const worst = rows.filter(needsTriage).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const lead = worst.find((r) => bad.some((b) => b.service === r.service)) ?? worst[0];
    return {
      focus,
      reply: {
        text: bad.length ? `For ${custName(scope.customerId)} · ${envName(scope.environment)} in ${period}:` : `Everything looks healthy for ${custName(scope.customerId)} · ${envName(scope.environment)} in ${period}.`,
        bullets: health.map((h) => `${h.name}: ${h.status === 'unknown' ? 'No data' : h.status[0].toUpperCase() + h.status.slice(1)} · ${h.reason}`),
        suggestions: lead ? [`Investigate ${shortTrace(lead.traceId)}`, 'How do I find a request?'] : ['How do I find a request?'],
      },
    };
  }
  if (has('retry') && has('timeout', 'timed out', '504')) {
    return { focus, reply: { text: 'Not straight away. A timeout means the outcome is unknown: the payout may already have gone through.', bullets: ['Check the transfer with Transaction status (by systemReferenceNumber) first.', 'Only resend if it was never created, and use a new x-request-id.', 'Paste the trace ID and I will check that specific request.'] } };
  }
  if (has('find', 'search', 'trace', 'how')) {
    return { focus, reply: { text: 'Paste a trace ID (like dt-e3b6ff2c) or an x-request-id. I will look it up, tell you what happened, why, and what to do next.', bullets: ['The trace ID is in the response headers and in the API activity table.', 'I search every customer, so it works even if the request is outside the current view.'] } };
  }
  if (has('hi', 'hello', 'hey')) return { focus, reply: { text: 'Hi! Paste a trace ID or ask what is failing, and we will work through it together.', suggestions: OPENING_SUGGESTIONS } };

  return { focus, reply: { text: "I didn't catch that. I can look up a request by trace ID, explain why it failed, tell you if it's safe to retry, find related failures, and help you resolve or escalate it.", suggestions: focus ? ['What should I do next?', 'Is it safe to retry?'] : OPENING_SUGGESTIONS } };
}
