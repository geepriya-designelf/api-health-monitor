import { useState } from 'react';
import { Icon } from './Icon';

// One-click trace copy with visible + announced confirmation, and a clear fallback if the clipboard is blocked.
export function TraceId({ id, available = true }: { id: string; available?: boolean }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2200);
  }
  return (
    <span className="trace">
      <span title={available ? id : `${id} (trace details unavailable)`}>{id.replace('demo-trace-', 'dt-')}</span>
      <button type="button" onClick={copy} aria-label={`Copy trace ID ${id}`}><Icon name="copy" size={14} /></button>
      <span role="status" aria-live="polite" className={state === 'failed' ? 'badge tone-error' : 'copied'}>
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy blocked, select text' : ''}
      </span>
    </span>
  );
}
