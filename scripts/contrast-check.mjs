#!/usr/bin/env node
// WCAG 2.1 contrast check for the design-token pairs used in the UI.
// Reads hex values from src/design-system/tokens.css so the check never drifts from the tokens.
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../src/design-system/tokens.css', import.meta.url), 'utf8');
const read = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
const lightAt = css.indexOf(":root[data-theme='light']");
const dark = read(css.slice(0, lightAt));
const light = { ...dark, ...read(css.slice(lightAt, css.indexOf('}', lightAt))) };
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const surfaces = ['bg-canvas', 'bg-surface', 'bg-raised'];
const checks = [
  ...['text-primary', 'text-secondary', 'text-muted', 'accent-blue-text', 'accent-cyan', 'accent-purple', 'status-success', 'status-warning', 'status-warning-text', 'status-error', 'status-info', 'status-unknown'].flatMap((t) => surfaces.map((s) => [t, s, 4.5])),
  ...['border-control', 'focus-ring', 'accent-blue', 'status-error-fill', 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'].flatMap((t) => surfaces.map((s) => [t, s, 3])),
  ['text-on-accent', 'accent-blue', 4.5],
];
let fail = 0;
for (const [themeName, tok] of [['dark', dark], ['light', light]]) {
console.log(`\n== ${themeName} theme ==`);
for (const [fg, bg, min] of checks) {
  if (!tok[fg] || !tok[bg]) { console.log(`?? missing token ${fg} or ${bg}`); fail++; continue; }
  const r = ratio(tok[fg], tok[bg]);
  const ok = r >= min;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${fg.padEnd(18)} on ${bg.padEnd(11)} ${r.toFixed(2)}:1 (min ${min})`);
}
}
console.log(fail ? `\n${fail} pair(s) below threshold` : '\nAll token pairs meet WCAG 2.1 AA thresholds');
process.exit(fail ? 1 : 0);
