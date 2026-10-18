import { CartesianGrid, ComposedChart, Bar, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import type { TrendPoint } from '../data/selectors';
import { fmtMs, fmtPct } from '../utils/format';

interface Props { data: TrendPoint[]; title: string; height?: number; targetMs?: number; show?: ('p99' | 'p95' | 'p50' | 'errors')[] }

function Tip({ active, payload }: { active?: boolean; payload?: { payload: TrendPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <b>{p.label} UTC</b>
      <div>P99 response time: {fmtMs(p.p99)}</div>
      <div>P95 response time: {fmtMs(p.p95)}</div>
      <div>Median response time: {fmtMs(p.p50)}</div>
      <div>Failed: {fmtPct(p.errorRate)} ({p.failed} of {p.requests} requests)</div>
    </div>
  );
}

// Latency (lines, left axis, ms) + error rate (bars, right axis, %). Includes a tabular alternative.
// Round axis steps (100, 200, 250, 500 ms, 1 s...) so gridlines read at a glance.
function msTicks(max: number): number[] {
  const step = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000].find((st) => max / st <= 4) ?? 10000;
  const top = Math.max(step, Math.ceil(max / step) * step);
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}
const fmtTick = (v: number) => (v === 0 ? '0' : v >= 1000 ? `${+(v / 1000).toFixed(1)} s` : `${v} ms`);

export function TrendChart({ data, title, height = 220, targetMs, show = ['p99', 'p95', 'p50', 'errors'] }: Props) {
  // With fewer than ~20 requests per interval, nearest-rank P95 and P99 both land on the slowest request.
  const busy = data.filter((p) => p.requests > 0);
  const thin = busy.length > 0 && busy.reduce((n, p) => n + p.requests, 0) / busy.length < 20;
  const worst = data.reduce<TrendPoint | null>((w, p) => ((p.p95 ?? 0) > (w?.p95 ?? 0) ? p : w), null);
  const maxMs = Math.max(targetMs ?? 0, ...data.flatMap((p) => (show.includes('p99') ? [p.p99 ?? 0] : []).concat(show.includes('p95') ? [p.p95 ?? 0] : [], show.includes('p50') ? [p.p50 ?? 0] : [])));
  const ticks = msTicks(maxMs || 100);
  const maxPct = Math.max(...data.map((p) => p.errorRate ?? 0));
  const pStep = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50].find((st) => maxPct / st <= 4) ?? 25;
  const pTicks = Array.from({ length: Math.max(1, Math.ceil(maxPct / pStep)) + 1 }, (_, i) => i * pStep);
  const desc = `${title}. ${data.length} intervals. Highest P95 ${fmtMs(worst?.p95 ?? null)} at ${worst?.label ?? 'n/a'} UTC. Peak P99 ${fmtMs(data.reduce<number | null>((m, p) => (p.p99 != null && (m == null || p.p99 > m) ? p.p99 : m), null))}.`;
  return (
    <figure style={{ margin: 0 }}>
      <div className="chart-legend" aria-hidden="true">
        {show.includes('p99') && <span><i className="dotted" style={{ color: 'var(--chart-5)' }} />P99</span>}
        {show.includes('p95') && <span><i style={{ background: 'var(--chart-1)' }} />P95</span>}
        {show.includes('p50') && <span style={{ color: 'var(--chart-2)' }}><i className="dashed" />Median</span>}
        {show.includes('errors') && <span><i style={{ background: 'var(--chart-4)', height: 8, width: 8 }} />Failed requests (%)</span>}
        <span className="legend-note">Response times exclude 30 s timeouts{show.includes('p99') && thin ? ' · P99 matches P95 when traffic is low' : ''}</span>
        {targetMs && <span style={{ color: 'var(--text-secondary)' }}><i className="dashed" />Target {targetMs} ms</span>}
      </div>
      <div role="img" aria-label={desc} style={{ height, marginTop: 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border-strong)' }} minTickGap={24} />
            <YAxis yAxisId="ms" tickLine={false} axisLine={false} width={56} domain={[0, ticks[ticks.length - 1]]} ticks={ticks} tickFormatter={fmtTick} />
            {show.includes('errors') && <YAxis yAxisId="pct" orientation="right" tickLine={false} axisLine={false} width={40} domain={[0, pTicks[pTicks.length - 1]]} ticks={pTicks} tickFormatter={(v) => `${v}%`} />}
            <Tooltip content={<Tip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            {show.includes('errors') && <Bar yAxisId="pct" dataKey="errorRate" fill="var(--chart-4)" fillOpacity={0.7} radius={[2, 2, 0, 0]} maxBarSize={14} isAnimationActive={false} />}
            {targetMs && <ReferenceLine yAxisId="ms" y={targetMs} stroke="var(--text-secondary)" strokeDasharray="2 4" />}
            {show.includes('p95') && <Line yAxisId="ms" type="monotone" dataKey="p95" stroke="var(--chart-1)" strokeWidth={2.25} dot={false} activeDot={{ r: 4, stroke: "var(--bg-canvas)", strokeWidth: 2 }} connectNulls isAnimationActive={false} />}
            {show.includes('p99') && <Line yAxisId="ms" type="monotone" dataKey="p99" stroke="var(--chart-5)" strokeWidth={2.5} strokeDasharray="0.1 5" strokeLinecap="round" dot={false} connectNulls isAnimationActive={false} />}
            {show.includes('p50') && <Line yAxisId="ms" type="monotone" dataKey="p50" stroke="var(--chart-2)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="data-alt">
        <summary>View chart data as a table</summary>
        <div className="table-wrap" style={{ maxHeight: 220, marginTop: 8 }}>
          <table className="data">
            <caption className="sr-only">{title}</caption>
            <thead><tr><th scope="col">Time (UTC)</th><th scope="col" className="num">Requests</th><th scope="col" className="num">Failed</th><th scope="col" className="num">Failed (%)</th><th scope="col" className="num">Median</th><th scope="col" className="num">P95</th><th scope="col" className="num">P99</th></tr></thead>
            <tbody>{data.map((p) => <tr key={p.t}><td>{p.label}</td><td className="num">{p.requests}</td><td className="num">{p.failed}</td><td className="num">{fmtPct(p.errorRate)}</td><td className="num">{fmtMs(p.p50)}</td><td className="num">{fmtMs(p.p95)}</td><td className="num">{fmtMs(p.p99)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
