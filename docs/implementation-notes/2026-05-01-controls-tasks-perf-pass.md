# 2026-05-01 — controls + tasks page-load perf pass

**Commit:** _pending_

## Design

End-to-end audit (route → usecase → repository → Prisma → client refetch)
of the controls + tasks list and detail pages found four wins. Two
shipped cleanly; two had to be scoped down because the original audit
framing didn't survive contact with the actual code; two were deferred
because the planned mechanism (new RLS-covered table + backfill, JOIN-
heavy aggregate refactor) is M-L effort and didn't fit the session.

Net effect on the user-visible flow:

  1. Controls list — no longer fires a duplicate `GET /controls` on
     hydration. The SSR payload is now honoured for 30 s, matching the
     pattern Tasks already used.
  2. Controls + Tasks list — six correlated `_count` subqueries per row
     dropped to two (the only two the list view actually reads).
  3. Control detail — three eager-loaded relation graphs (`risks`,
     `policyLinks`, `_count`) dropped from `getById`. Verified no
     caller in `src/` reads any of the three off the detail payload.
  4. Control detail — `LinkedTasksPanel` lazy-imported (`next/dynamic`,
     `ssr: false`), matching `TraceabilityPanel` / `TestPlansPanel`.
     Bundle no longer ships LinkedTasksPanel for users who never open
     the Tasks tab.
  5. WorkItem dashboard — `topLinkedRaw` was an unbounded `findMany`
     followed by JS aggregation. Replaced with `groupBy` + `take: 5`
     pushed to Postgres.

## Files

| File | Role |
| --- | --- |
| `src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx` | Added `staleTime: 30_000` + `initialDataUpdatedAt: filtersMatchInitial ? Date.now() : 0` on the list `useQuery` |
| `src/app/t/[tenantSlug]/(app)/tasks/TasksClient.tsx` | Same `initialDataUpdatedAt` fix (already had `staleTime`) |
| `src/app-layer/repositories/ControlRepository.ts` | Narrowed `list()` + `listPaginated()` `_count` to `{ controlTasks, evidenceLinks }`; dropped `risks` / `policyLinks` / `_count` relations from `getById()` |
| `src/app/t/[tenantSlug]/(app)/controls/[controlId]/page.tsx` | `LinkedTasksPanel` → `dynamic(...)` |
| `src/app-layer/repositories/WorkItemRepository.ts` | `topLinkedRaw` → `groupBy` + `take: 5` |
| `tests/guardrails/controls-tasks-list-hydration.test.ts` *(new)* | Structural ratchet on `staleTime`, `initialDataUpdatedAt`, and the narrow `_count` shape. Catches all three regressions on a single `npm test` invocation. |

## Decisions

  - **Wave 2.1 scoped down**, not as planned. The plan called for
    splitting `getById` into `getControlHeader` + lazy tab data. After
    reading the detail page (`controls/[controlId]/page.tsx`) I found:
    (a) the page reads tab badge counts off `.length` on the relation
    arrays, not `_count` — so dropping arrays in favour of `_count`
    requires also rewiring the badges; (b) Tasks/Evidence/Mappings
    tab bodies all map directly off `control.controlTasks`,
    `control.evidence`, `control.evidenceLinks`,
    `control.frameworkMappings`. That's a real tab-body refactor.
    But — and this is the win — `control.risks`, `control.policyLinks`,
    and `control._count` are loaded by `getById` and read by **zero**
    callers in `src/` (verified by grep). Pure waste. Dropped those
    three eagerly-loaded shapes; deferred the bigger lazy-tab refactor.

  - **Wave 2.2 skipped.** The audit flagged the task detail page as
    having a serial waterfall. Re-reading
    `tasks/[taskId]/page.tsx:121-169` the per-tab `useEffect`s gate on
    `tab !== 'links'` etc. — they only fire when the tab is opened. On
    Overview (the default tab) only `fetchTask()` runs. There's no
    initial-load waterfall to fix. The remaining inefficiency is post-
    mutation full re-fetch (`fetchTask()` after status change /
    assign), which is a UX-responsiveness win, not a page-load win.
    Out of scope for this pass; will get folded into the React-Query
    migration if/when the page is rewritten.

  - **Wave 3 deferred.** Replacing the `db.task.count(...)` derivation
    of `TSK-N` with a `TaskKeySequence` upsert is the right fix, but
    landing it requires: a new tenant-scoped table → RLS policies →
    `FORCE ROW LEVEL SECURITY` → a backfill that parses
    `MAX(SUBSTRING(key FROM 'TSK-([0-9]+)$'))` per tenant → integration
    test that proves 20 concurrent creates produce contiguous keys.
    That's a focused PR, not a tail-end of a perf pass. Filed for
    follow-up; the existing race remains, gated by the unique
    `[tenantId, key]` index that surfaces it as a 409 instead of a
    silent collision.

  - **Wave 4a deferred.** `getControlDashboard` aggregates in JS over a
    `findMany` that includes every `controlTask`. The `groupBy`
    refactor is straightforward for status / applicability /
    implementationProgress, but `topOwners` requires joining
    `ControlTask` to `Control.ownerUserId` — Prisma's `groupBy`
    doesn't natively support cross-relation grouping, so it'd need a
    `$queryRaw`. That's its own review surface; deferred.

  - **Wave 4c skipped.** The plan suggested
    `Cache-Control: private, max-age=10` on list GETs. With Wave 1's
    `staleTime: 30_000` already eliminating the duplicate hydration
    fetch, the HTTP cache adds a post-mutation staleness window
    without fixing a measurable problem. The React Query memory
    cache covers the back-button case. Net negative.

## Verification

  - `npx tsc --noEmit` — clean.
  - `npx eslint <changed files>` — clean.
  - `tests/guardrails/controls-tasks-list-hydration.test.ts` — 5/5
    pass. Catches: `initialDataUpdatedAt: 0` regression on either
    client; missing `staleTime` on either client; widening the list
    `_count` projection back to six keys.
  - `tests/unit/repository-tracing.test.ts`, `controls-filter-defs`,
    `controls-list-polish`, `control-applicability`,
    `task-relevance`, `work-item-status` — all green.
  - 6 pre-existing guardrail failures (`admin-route-coverage`,
    `no-client-side-filtering`, `table-platform-drift`,
    `form-primitive-adoption`, `control-detail-sheet` regex check)
    confirmed present on `main` before any change in this pass —
    not introduced here.

## Bounded follow-ups

  - Tab-lazy refactor on the control detail page (drop `controlTasks`
    / `evidenceLinks` / `evidence` / `frameworkMappings` arrays in
    favour of per-tab queries; switch tab badges to `_count`).
  - `TaskKeySequence` model + migration + atomic upsert.
  - `getControlDashboard` `groupBy` refactor, including the topOwners
    `$queryRaw`.
  - Task index review — drop redundant `[tenantId, dueAt]`, add
    `[tenantId, controlId, status]`.
  - React-Query migration of `tasks/[taskId]/page.tsx` so post-mutation
    flows can use `setQueryData` instead of full re-fetch.
