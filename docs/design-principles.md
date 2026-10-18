# Design principles in practice

How the Nium API Health Monitor applies our critique framework. Each principle maps to a decision you can see in the prototype, so reviewers can test the reasoning, not just the pixels.

## 1. Critique through goals, hierarchy, load and decisions
The screen answers four questions in reading order: **Is anything wrong?** (verdict banner) → **How bad?** (four KPIs) → **Where?** (service health, performance, webhooks) → **What do I do?** (activity table with triage). Exceptions are loud; healthy rows recede to muted text so a single failure is visible in a page of successes.

## 2. Navigation follows the engineer's mental model
Five destinations mirror the job, not the backend: Overview (assess), API activity (investigate and resolve), Webhooks (customer-facing delivery), Alerts (stay informed), Integration (setup). Customer, environment and time range live in one shared scope that survives page changes, so moving from overview to investigation never loses context. Sidebar counts (critical services, open triage, firing alerts) tell you where work is waiting before you click.

## 3. Hierarchy across many metrics
Immediate: verdict, success rate, P95, critical services. On demand: P50/P90 (KPI subtext), chart data table, trace metadata, evidence (expanded row). Nothing is removed; depth sits one deliberate action away.

## 4. Lowering cognitive load
- Jargon is explained in place: info tips on API calls, P95, success rate and slowest endpoint.
- One status vocabulary everywhere: Healthy, Degraded, Critical, No data. Always icon + word, never colour alone.
- Sensible defaults: Production, last 90 minutes, newest first, and "Needs resolution" one click away.

## 5. Data visualization answers an operational question
The performance chart answers "when did it go wrong, and was it latency or errors?" Latency lines (left axis, ms) and error bars (right axis, %) share one time axis. Units, interval size and data freshness are labelled; selecting a service adds its P95 target line. Every chart has a tabular alternative. Brand secondary colours (Purple, Blue, Orange) are reserved for data so they never collide with status colours. 3D is used for depth and the service stack only; quantitative charts stay 2D because perspective distorts values.

## 6. Alerts communicate severity, impact and next action
Each rule shows its state (Firing first), severity, **what is affected** and a **link to the next action**. Rules that fire three or more times in 24 hours are flagged as noisy to fight alert fatigue. Timeouts are labelled **Outcome unknown**, not Failed, because a payout might have gone through: the interface separates confirmed failures from uncertain ones.

## 7. Enterprise realities
- Consequential actions are guarded: disabling a warning or critical alert asks for confirmation and spells out the risk.
- Payout retries carry a "Before you retry" caution to prevent double payments.
- Secrets are never shown (x-api-key always redacted).
- Experts get speed: `/` jumps to search, bulk "apply to related failures" in triage, copy-ready handoffs.

## 8. Start from the problem space
The prototype is built around six tasks from the brief (assess health, find the slowest endpoint, find a failed payout, hand off a trace, configure an alert, switch environments), not around available data.

## 9 and 13. Learnability with expert efficiency
Layers of depth: verdict for everyone, KPIs for leads, triage panel for engineers. Advanced detail is discoverable (chevrons, info tips, "View handoff text") but never in the way.

## 10. Information architecture scales
Pages are organised by user goal. Customer scope includes "All customers" for portfolio views, and tenant data, roles and branding can slot in without restructuring navigation.

## 11. Prioritising issues
The triage panel ranks by impact: incidents (clusters of server failures on one service) are flagged ahead of one-off validation errors, and each issue names an owner so it lands with the right team.

## 12. Measuring improvement
Baseline before rollout, then compare: task completion rate, time on task, error rate, navigation success, confidence, plus operational measures (median time to diagnose, time to detect and acknowledge critical failures, escalation rate, clarification exchanges per issue). No results are claimed yet; this is a prototype.

## 14. Consistency through the design system
Colour semantics are tokenised in `src/design-system/tokens.css` and contrast-checked by `npm run tokens:contrast`. Mint means healthy or primary action, Yellow means warning, Red means critical, Gray means no data. One table pattern, one badge pattern, one disclosure pattern across pages.

## 15. When stakeholders want more data
New data gets a home based on the decision it supports: primary view (changes the verdict), contextual drill-down (explains an issue), filter (narrows a list) or a separate workspace (analysis). The expanded row and chart table exist so the overview never has to grow.

## 16. Collaboration
The prototype runs on a documented, validated JSON dataset behind a data access boundary (`src/data/repository.ts`), so engineering can swap in real telemetry without rewriting UI, and PMs can review real edge cases rather than ideal states.

## Brand application (Nium 2026)
**Rule: colour only for exceptions.** Healthy is calm and neutral; Yellow means degraded; Red means critical. Mint is reserved for three brand moments: the logo, the primary action and the active nav marker.

| Role | Dark theme | Light theme |
| --- | --- | --- |
| Canvas / surface | Black #000000 / #0C0D0D | #F4F4F0 / White |
| Logo | Mint block #00FFD4 | Black variation (per brand light-background usage) |
| Primary action | Mint, black text | Black, white text (Mint on white is 1.2:1, too faint) |
| Healthy | Neutral gray + check | Neutral gray + check |
| Degraded | Yellow #F7F775 | Dark amber #7A5E00 (yellow fails as text on white) |
| Critical | Red #E43A3A fills, #FF6B6B small text | Red #E43A3A fills, #B42323 text |
| No data | Gray, dashed marker | Gray, dashed marker |
| Charts | Blue #07ACFF (P95), gray dashed (P50), Red (errors) | Blue #0077BE, gray dashed, Red |

Both themes are contrast-checked by `npm run tokens:contrast`.

| Type role | Font | Why |
| --- | --- | --- |
| UI, tables, chart axes | Inter (variable) | Built for screens, true tabular figures, crisp at 11 to 13px |
| Page title, KPI numerals | Blinker Light / Regular | Brand voice where the eye lands first; condensed numerals |
| Trace IDs, request IDs, paths, error codes | Roboto Mono | Character-level accuracy only where it matters |

Navigation collapses to icons (preference remembered); hovering or focusing an icon shows its name and purpose, and links keep full accessible names. Theme follows the viewer's system setting until they choose, then remembers it.
