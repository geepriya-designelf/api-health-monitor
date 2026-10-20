import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssistant } from '../../app/AssistantContext';
import { useScopeContext } from '../../app/ScopeContext';
import { useTriage } from '../../app/TriageContext';
import { HttpStatusBadge, MethodTag } from '../../components/Badges';
import { Icon } from '../../components/Icon';
import { dataset } from '../../data/repository';
import { diagnose, OWNER_LABEL } from '../../data/triage';
import type { ApiRequest } from '../../data/types';
import { fmtMs, fmtTime } from '../../utils/format';
import { handoffText } from '../activity/handoff';
import { OPENING_SUGGESTIONS, respond, shortTrace, type BotAction, type BotReply } from './engine';

interface Msg { id: number; from: 'user' | 'bot'; text: string; reply?: BotReply }
let seq = 0;

// Docked, non-modal panel: the engineer can keep reading the dashboard while they talk it through.
export function AssistantPanel() {
  const a = useAssistant();
  const s = useScopeContext();
  const triage = useTriage();
  const navigate = useNavigate();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [focus, setFocus] = useState<ApiRequest | null>(null);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const send = (text: string) => {
    if (!text.trim() || typing) return;
    setMsgs((m) => [...m, { id: ++seq, from: 'user', text }]);
    setDraft('');
    setTyping(true);
    // A short pause so replies read as a conversation rather than a page refresh.
    window.setTimeout(() => {
      const out = respond(text, s.scope, focus);
      setFocus(out.focus);
      setMsgs((m) => [...m, { id: ++seq, from: 'bot', text: out.reply.text, reply: out.reply }]);
      setTyping(false);
    }, 450);
  };

  useEffect(() => { if (a.open) inputRef.current?.focus(); }, [a.open]);
  useEffect(() => { if (a.open && a.prompt) { send(a.prompt); a.consumePrompt(); } }, [a.open, a.prompt]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, typing]);
  useEffect(() => {
    if (!a.open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') a.close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [a.open]);

  const act = async (action: BotAction, r?: ApiRequest) => {
    const req = r ?? focus;
    if (!req) return;
    const d = diagnose(req, dataset.requests.filter((x) => x.customerId === req.customerId && x.environment === req.environment));
    const say = (text: string) => setMsgs((m) => [...m, { id: ++seq, from: 'bot', text }]);
    if (action.kind === 'open_in_table') {
      try { sessionStorage.setItem('nium-pending-search', shortTrace(req.traceId)); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent('nium-search', { detail: shortTrace(req.traceId) }));
      navigate('/activity');
      window.setTimeout(() => { try { sessionStorage.removeItem('nium-pending-search'); } catch { /* ignore */ } }, 500);
      say(`Opened API activity filtered to ${shortTrace(req.traceId)}.`);
    } else if (action.kind === 'copy_handoff') {
      const text = `${handoffText(req)}\nLikely cause: ${d.likelyCause}\nSuggested owner: ${OWNER_LABEL[d.owner]}`;
      let ok = true;
      try { await navigator.clipboard.writeText(text); } catch { ok = false; }
      say(ok ? 'Handoff copied. Paste it into the ticket or Slack thread.' : "Your browser blocked the clipboard. Open the row's More details to copy the handoff.");
    } else if (action.kind === 'escalate') {
      triage.update([req.requestId, ...d.similar.map((x) => x.requestId)], { status: 'escalated', note: `Escalated to ${OWNER_LABEL[d.owner]} via assistant` });
      try { await navigator.clipboard.writeText(handoffText(req)); } catch { /* ignore */ }
      say(`Marked as escalated to ${OWNER_LABEL[d.owner]} and copied the handoff. I'll keep the related failures grouped under it.`);
    } else if (action.kind === 'resolve') {
      const ids = [req.requestId, ...d.similar.map((x) => x.requestId)];
      triage.update(ids, { status: 'resolved', note: 'Resolved via assistant' });
      say(`Done. ${ids.length > 1 ? `${ids.length} requests` : 'The request'} marked resolved.`);
    }
  };

  if (!a.open) return null;
  const last = msgs[msgs.length - 1];
  const chips = !msgs.length ? OPENING_SUGGESTIONS : last?.from === 'bot' ? last.reply?.suggestions ?? [] : [];

  return (
    <aside className="assistant" role="dialog" aria-modal="false" aria-labelledby="assistant-title">
      <header className="assistant-head">
        <span className="assistant-mark" aria-hidden="true"><Icon name="sparkle" size={16} /></span>
        <div>
          <h2 id="assistant-title">Investigation assistant</h2>
          <p>Answers from the request log and triage rules · demo, no AI service connected</p>
        </div>
        <button type="button" className="btn btn-ghost assistant-close" onClick={a.close} aria-label="Close assistant"><Icon name="close" size={16} /></button>
      </header>

      <div className="assistant-log" ref={logRef} role="log" aria-live="polite" aria-label="Conversation">
        {!msgs.length && (
          <div className="assistant-empty">
            <p><b>Look into a request yourself.</b></p>
            <p>Paste a trace ID or ask what's failing. I'll tell you what happened, why, whether it's safe to retry, and who to bring in only if you need to.</p>
          </div>
        )}
        {msgs.map((m) => m.from === 'user'
          ? <div key={m.id} className="msg msg-user">{m.text}</div>
          : (
            <div key={m.id} className="msg msg-bot">
              <p>{m.text}</p>
              {m.reply?.request && <RequestCard r={m.reply.request} />}
              {m.reply?.bullets && <ul>{m.reply.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
              {m.reply?.caution && <p className="msg-caution"><Icon name="alert" size={13} /><span><b>Before you retry.</b> {m.reply.caution}</span></p>}
              {m.reply?.actions && (
                <div className="msg-actions">
                  {m.reply.actions.map((x) => <button key={x.label} type="button" className={`btn btn-sm${x.primary ? ' btn-primary' : ''}`} onClick={() => act(x, m.reply?.request)}>{x.label}</button>)}
                </div>
              )}
            </div>
          ))}
        {typing && <div className="msg msg-bot msg-typing" aria-label="Assistant is typing"><span /><span /><span /></div>}
      </div>

      {chips.length > 0 && (
        <div className="assistant-chips" aria-label="Suggested questions">
          {chips.map((c) => <button key={c} type="button" className="assistant-chip" onClick={() => send(c)}>{c}</button>)}
        </div>
      )}
      <form className="assistant-input" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
        <label htmlFor="assistant-q" className="sr-only">Ask about a request</label>
        <textarea id="assistant-q" ref={inputRef} rows={1} value={draft} placeholder="Paste a trace ID or ask a question…"
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); } }} />
        <button type="submit" className="btn btn-primary" aria-label="Send" disabled={!draft.trim() || typing}><Icon name="send" size={15} /></button>
      </form>
    </aside>
  );
}

function RequestCard({ r }: { r: ApiRequest }) {
  const ep = dataset.endpoints.find((e) => e.id === r.endpointId);
  return (
    <div className="msg-card">
      <div className="msg-card-row"><MethodTag method={r.method} /><b>{ep?.name}</b><HttpStatusBadge status={r.httpStatus} /></div>
      <div className="msg-card-meta mono">{shortTrace(r.traceId)} · {fmtTime(r.timestamp)} · {fmtMs(r.latencyMs)}{r.errorCode ? ` · ${r.errorCode}` : ''}</div>
    </div>
  );
}
