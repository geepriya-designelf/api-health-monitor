import { useScopeContext } from '../../app/ScopeContext';
import { ActivityTable } from './ActivityTable';

export function ActivityPage() {
  const s = useScopeContext();
  return (
    <section className="panel activity-panel" aria-label="API activity">
      <p className="secondary" style={{ marginBottom: 12, fontSize: 13 }}>Open a failed request to see the likely cause, the evidence and the next steps, then move it from New to Resolved.</p>
      <ActivityTable key={`${s.customerId}-${s.environment}-${s.range}`} pageSize={18} />
    </section>
  );
}
