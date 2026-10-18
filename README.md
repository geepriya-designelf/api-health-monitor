# Nium API Health Monitor (prototype)

Interactive prototype of an API integration health dashboard for integration engineers. Styled to the Nium 2026 brand with dark and light themes: colour only for exceptions, Inter for UI and data, Blinker for titles and KPI numerals, Roboto Mono for IDs. **All telemetry is synthetic demo data.** No connection to Nium, Datadog, Elasticsearch, Grafana, Metabase or any notification provider.

## Status
Phase 2 direction: the sidebar dashboard from the hand sketch (Overview, API activity, Webhooks, Alerts, Integration), with a triage and resolve flow on failed requests. The three early concepts are documented in `docs/concepts.md`; their routes were retired when the data moved to aggregated metrics.

### Triage and resolve
Expanding a failed row in API activity shows:
- **Diagnosis**: likely cause, suggested owner, confidence, and a retry caution for payouts and timeouts
- **Evidence**: related failures within 30 minutes, healthy calls on the same endpoint, trace and request metadata (x-api-key redacted)
- **Resolve**: New → Investigating → Escalated → Resolved, a next-steps checklist, "Escalate and copy handoff", and an option to apply actions to related failures

Suggestions come from rules in `src/data/triage.ts`, not from AI or real telemetry. Triage state is stored only in the viewer's browser.

## Run locally
Requires Node 18+.

```bash
npm install
npm run dev            # http://127.0.0.1:5173/
```

Routes: `#/` overview · `#/activity` · `#/webhooks` · `#/alerts` · `#/integration`

Offline single-file preview (no server needed):
```bash
npm run build:preview-file   # writes preview-file/index.html, open it in a browser
```

## Scripts
| Script | Purpose |
| --- | --- |
| `npm run data:generate` | Regenerate `data/nium-dashboard-mock-data.json` (deterministic) |
| `npm run data:validate` | Schema, referential integrity and metric invariants |
| `npm run tokens:contrast` | WCAG 2.1 contrast check for token pairs |
| `docs/design-principles.md` | How each UX principle and the 2026 brand map to product decisions |
| `npm run typecheck` | TypeScript |
| `node scripts/screenshot.mjs` | Screenshots + axe-core scan (dev server running) |
| `node scripts/interaction-check.mjs` | Interaction smoke tests on the single-file build |

## Structure
```
data/                 JSON fixture + data dictionary
docs/                 design concepts and decisions
scripts/              data generator, validators, screenshot/axe runner
src/app/              shell, routing, scope state
src/design-system/    tokens and global styles
src/components/       shared components (draft; hardened into the library in phase 2)
src/data/             types, repository (data access boundary), selectors (derived metrics)
src/features/         overview, activity (table + triage), webhooks, alerts, integration
src/utils/            formatting
```
