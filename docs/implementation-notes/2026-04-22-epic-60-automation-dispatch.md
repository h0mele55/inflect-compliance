# 2026-04-22 — Epic 60 automation event dispatch backbone

**Commit:** _(stamped post-commit)_

Third and final Epic 60 backend piece. The earlier notes landed the
persistence layer (`-foundation`) and the typed in-process bus
(`-bus`). This note lands the **operational backbone** — real
usecases emit, a BullMQ job dispatches, and `AutomationExecution`
rows are persisted.

## Flow

```
 ┌─────────────────┐                                     Web server
 │ usecases/       │                                     ─────────
 │  task.ts        │   emitAutomationEvent(ctx, input)     │
 │  issue.ts       │─────────────────┐                     │
 │  events/*.ts    │                 ▼                     │
 │  (risk / test / │       ┌───────────────────┐           │
 │   onboarding)   │       │ AutomationBus     │           │
 └─────────────────┘       │ stamps tenantId,  │           │
                           │ emittedAt, actor  │           │
                           └────────┬──────────┘           │
                                    │                      │
                          ┌─────────┴──────────┐           │
                          ▼                    ▼           │
                 in-process subscribers   bullmqDispatcher  │
                 (observers, tests)       .enqueue(        │
                                             'automation-   │
                                              event-        │
                                              dispatch',    │
                                              serialized)   │
                                                 │          │
 ──────────────────────────────────────── Redis queue ──────┘
                                                 │
                                                 ▼         Worker
 ┌─────────────────┐    ┌──────────────────────────────┐   ───────
 │ executor-       │    │ runAutomationEventDispatch   │   │
 │ registry        │───▶│  - load ENABLED rules        │   │
 │                 │    │  - matchesFilter(event)      │   │
 │                 │    │  - insert-to-claim PENDING   │   │
 │                 │    │    (P2002 = silent dedupe)   │   │
 │                 │    │  - RUNNING → SUCCEEDED/FAIL  │   │
 │                 │    │  - bump rule counter         │   │
 └─────────────────┘    └──────────────┬───────────────┘   │
                                       ▼                   │
                              AutomationExecution row      │
                              (append-only history)        │
```

## Dispatch-job architecture

One `automation-event-dispatch` job per emitted domain event. The
worker picks up the Redis message, the executor registry routes to
`runAutomationEventDispatch`, which:

1. **Loads rules** — tenantId + triggerEvent + `status = ENABLED` +
   `deletedAt IS NULL`, ordered by priority desc then createdAt asc.
2. **Evaluates filter** — `matchesFilter(event, rule.triggerFilterJson)`.
   Mismatches are counted as `skippedFilter` and never touch the DB.
3. **Insert-to-claim** — creates a `PENDING` `AutomationExecution` row
   with an idempotency key derived from
   `(ruleId, event, stableKey)` when the producer supplied a
   `stableKey`. Concurrent workers collide on the unique
   `(tenantId, idempotencyKey)` index → the loser catches Prisma
   P2002 and increments `skippedDuplicate`.
4. **Advances state** — `PENDING` → `RUNNING` (gated on `status =
   PENDING` to defeat double-advance) → `SUCCEEDED` /
   `FAILED`. The action execution itself is a no-op for this epic;
   the outcome records the rule's `actionType` and a "handlers
   register in a later epic" note so the pipeline is observable
   even before action handlers exist.
5. **Bumps rule counters** — `executionCount` increment +
   `lastTriggeredAt` timestamp. Uses `updateMany` so it never writes
   `updatedByUserId` (dispatcher ≠ user action).

## Execution-record flow

| Event phase | Row state | Written by |
|---|---|---|
| Producer emits, bus fans out | — | (no DB write) |
| Worker picks up job | — | (no DB write) |
| Rule filter matches | `PENDING` with `startedAt` | `create()` — P2002 on dedupe key means another worker won |
| Worker starts action | `RUNNING` | `updateMany(status='PENDING')` guard |
| Action succeeded | `SUCCEEDED` with `outcomeJson`, `completedAt`, `durationMs` | `update()` |
| Action threw | `FAILED` with `errorMessage`, `errorStack`, `completedAt` | `update()` in catch |
| Filter didn't match | (row never created) | counted as `skippedFilter` |
| Idempotency collision | (row never created) | counted as `skippedDuplicate` |

Rows are **never deleted** once written — this is the audit-grade
history surface the builder UI and compliance exports will query.

## Usecases wired

Chose four high-automation-value sites in addition to the existing
risk/test/onboarding fan-outs, keeping changes surgical (no
refactoring of usecase structure):

| Event | Usecase site | Why this event matters for automation |
|---|---|---|
| `TASK_CREATED` | `usecases/task.ts:createTask` | "When a CRITICAL INCIDENT task is created, page on-call" |
| `TASK_STATUS_CHANGED` | `usecases/task.ts:setTaskStatus` | "When a task moves to BLOCKED, escalate to manager" |
| `ISSUE_CREATED` | `usecases/issue.ts:createIssue` | "When a HIGH issue opens on a production asset, auto-create a control gap task" |
| `ISSUE_STATUS_CHANGED` | `usecases/issue.ts:setIssueStatus` | "When an issue closes, auto-close related tasks" |

These land alongside the 16 risk/test/onboarding events already
fanned out by the audit emitters — total surface now 17 typed
domain events, covering every mutating change in the GRC domains
most valuable to rule builders.

## Files changed

| Path | Role |
|---|---|
| `src/app-layer/jobs/types.ts` | New `AutomationEventDispatchPayload` interface; map entry + JOB_DEFAULTS tuning for fire-and-forget cadence |
| `src/app-layer/jobs/automation-event-dispatch.ts` | Core executor: rule lookup, filter eval, insert-to-claim, PENDING → RUNNING → SUCCEEDED/FAILED, rule counter bump, tenantId-mismatch guard |
| `src/app-layer/jobs/executor-registry.ts` | Register executor with lazy import, wire into job-runner result shape |
| `src/app-layer/automation/bus-bootstrap.ts` | `installAutomationBusDispatcher()` swaps the bus default dispatcher for one that enqueues dispatch jobs; `toDispatchPayload()` serializer |
| `src/app-layer/automation/events.ts` | Catalogue extended with TASK_CREATED, TASK_STATUS_CHANGED, ISSUE_CREATED, ISSUE_STATUS_CHANGED |
| `src/app-layer/automation/event-contracts.ts` | Four new discriminated-union variants + data shapes |
| `src/app-layer/automation/index.ts` | Barrel re-exports |
| `src/app-layer/usecases/task.ts` | Emit TASK_CREATED + TASK_STATUS_CHANGED alongside existing audit writes (fromStatus captured from pre-mutation read) |
| `src/app-layer/usecases/issue.ts` | Emit ISSUE_CREATED + ISSUE_STATUS_CHANGED alongside existing audit writes |
| `src/instrumentation.ts` | Call `installAutomationBusDispatcher()` at Next.js startup |
| `scripts/worker.ts` | Install dispatcher at BullMQ worker startup so events emitted *from* a job also fan to the queue |
| `tests/unit/automation-event-dispatch.test.ts` | 9 tests: rule scoping, persistence, filter skip, P2002 silent dedup, non-P2002 failure, action-throw → FAILED, tenantId-mismatch guard, nullable stableKey, priority order |
| `tests/unit/automation.bus-bootstrap.test.ts` | 8 tests: serialization, tenantId-mismatch guard, enqueue propagation, install idempotency, emit failure swallowing |
| `tests/unit/automation.task-issue-wiring.test.ts` | 4 tests: createTask/setTaskStatus/createIssue/setIssueStatus publish correct events with correct data + stableKey |
| `tests/integration/automation-event-flow.test.ts` | 6 end-to-end tests against real Postgres: persistence, filter, idempotency, DISABLED/ARCHIVED skip, cross-tenant isolation |

## Tests added (summary)

| Layer | File | Count | What it pins |
|---|---|---:|---|
| Unit | `automation-event-dispatch.test.ts` | 9 | Executor contract vs mocked Prisma |
| Unit | `automation.bus-bootstrap.test.ts` | 8 | Bus → BullMQ wiring + serialization |
| Unit | `automation.task-issue-wiring.test.ts` | 4 | Usecase emit sites |
| Integration | `automation-event-flow.test.ts` | 6 | Real DB: rule → dispatch → execution row, idempotency, tenant isolation |
| **Total new** | | **27** | |

Across the full Epic 60 backend (foundation + bus + dispatch),
**99 unit tests + 6 integration tests = 105 tests, all passing**.

## Decisions

- **One dispatch job per event, not per rule.** A single job does
  the fan-out, so Redis bandwidth scales with emitted events (low
  cardinality — measured in thousands/day) not with enabled rules
  (potentially dozens per tenant). Per-rule parallelism can land
  later if any single action class gets expensive; it's not worth
  paying that Redis tax today.
- **Stub action step deliberately.** The mission explicitly said
  "event dispatch and execution foundation, not full rule
  execution logic". Stubbing lets the next epic plug in action
  handlers at the clearly-marked `=== Action handlers would plug
  in here ===` point without touching the dispatch shell.
- **tenantId carried twice (top-level + in event).** Belt-and-braces
  guard: the top-level is for queue indexing / ops dashboards, the
  in-event is for the executor's rule lookup. The mismatch guard
  turns a producer bug into a loud fail instead of a silent
  cross-tenant dispatch.
- **Pre-mutation read in `setTaskStatus` / `setIssueStatus`.** The
  repository's `setStatus()` returns the updated row only, losing
  `fromStatus`. I added a `getById` before the mutation — one extra
  read per status change is cheap, and the `fromStatus` landing in
  the event payload is what makes "when task moves OPEN →
  IN_PROGRESS, escalate" rules expressible at all.
- **No refactor of task.ts / issue.ts.** Those files emit audit
  events inline (not via a shared helper). I could have extracted
  `task.events.ts` to match the risk/test/onboarding pattern, but
  that's a bigger change for no dispatch-layer benefit. The mission
  said "avoid invasive coupling"; adding four emit calls next to
  four existing audit calls is the minimum intervention.
- **Integration test skips BullMQ, hits the executor directly.**
  The bus-bootstrap unit test already proves emit → enqueue; the
  integration test's value is proving enqueue → executor → DB. Not
  running Redis in CI keeps the test suite at sub-second cost.
- **`resetDatabase()` helper not touched.** It doesn't include
  `AutomationRule` / `AutomationExecution` yet. The integration
  test cleans up its own rows in `beforeEach`, which is the correct
  scope — broadening the reset helper is a cross-cutting change
  that should land with the next epic that needs it.
