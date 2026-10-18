# Design directions

All three concepts share the same tokens, the same synthetic dataset and the same draft components, so the comparison is about hierarchy and workflow, not styling. Open them at `#/concept-a`, `#/concept-b`, `#/concept-c`, or compare on `#/`.

## A · Operational overview
**Question it answers:** Is this integration healthy, and if not, where?

**Hierarchy:** integration verdict + one "Investigate" action → four KPIs (success, error rate, P95, volume) → service health cards (which double as filters) → activity table.

**Workflow:** pick customer and environment → read the verdict → click the failing service → open a request.

**Strengths:** fastest health read, lowest cognitive load, works on a wall screen or in stand-up.
**Trade-offs:** shallow for debugging; no trend or error grouping; trace IDs are one click deeper.
**Keep:** verdict banner, service-cards-as-filters, KPI row.

## B · Investigation workspace
**Question:** What broke, where is the evidence, and who do I hand it to?

**Hierarchy:** failure summary (failed, server-side, slow, slowest endpoint) → error/latency trend → filter rail with service status and top error codes → dense failure-first table with trace copy.

**Workflow:** scan top errors → click an error code → copy trace ID or open the drawer → copy the engineering handoff.

**Strengths:** shortest path from symptom to handoff; error grouping replaces log spelunking.
**Trade-offs:** busier first view; assumes something is wrong, so weaker as an "all clear" screen.
**Keep:** top errors list, failure-first default, handoff block, chart data table.

## C · Integration command center
**Question:** Is this customer ready to go live, and what can they see?

**Hierarchy:** tenant header (brand accent, onboarding progress) → Sandbox vs Production readiness → modules (service health, API performance, webhook delivery) → audience-aware activity table.

**Workflow:** pick customer → compare environments → check webhooks → toggle Customer view to preview the white-label surface.

**Strengths:** frames health around onboarding; explicit internal vs customer boundary; modular for templates.
**Trade-offs:** more surface to maintain; investigation sits a level down.
**Keep:** environment comparison, webhook module, audience toggle, tenant theming hook.

## Health rules used by every concept
- **Unknown:** telemetry missing or stale, or no requests in range. Never rendered as healthy.
- **Critical:** server-side failure rate (5xx + timeouts) ≥ 5%, or P95 ≥ 2× target.
- **Degraded:** server-side failure rate ≥ 1%, client error rate ≥ 10%, or P95 above target.
- Webhooks (Concept C environment verdict): < 90% delivered is critical, < 97% degraded.
