# 2026-04-22 — Epic 60 automation event bus & domain-event contracts

**Commit:** _(stamped post-commit)_

Second half of Epic 60's backend foundation. The earlier note
(`2026-04-22-epic-60-automation-foundation.md`) landed the
persistence layer — tables, enums, repositories, policies. This note
lands the **event bus and typed domain-event contracts**: the piece
that actually carries events from usecase emitters into the
automation dispatcher.

## Architecture

```
┌──────────────┐    ┌───────────────────────────┐    ┌──────────────────┐
│  Usecases    │    │  events/*.ts (emitters)   │    │  Audit log       │
│  (risk,      │───▶│  - write audit log        │───▶│  (hash-chained)  │
│   task,      │    │  - emitAutomationEvent()  │    └──────────────────┘
│   onboard…)  │    └─────────────┬─────────────┘
└──────────────┘                  │
                                  ▼
                       ┌──────────────────────┐
                       │  AutomationBus       │
                       │  (in-process)        │
                       │                      │
                       │  emit(ctx, input) ─┬─┼─▶ named subscribers
                       │                    └─┼─▶ wildcard subscribers
                       │                      │
                       │  setDispatcher(d) ─┬─┼─▶ pluggable dispatcher
                       │                    │ │   (no-op default;
                       │                    │ │    BullMQ later)
                       │  tenantId + actor │ │
                       │  + emittedAt ◀────┘ │
                       │  stamped here       │
                       └──────────────────────┘
```

Key shape: every event flows through one bus emission point. The bus
stamps the non-forgeable fields (`tenantId` from `RequestContext`,
`emittedAt` from the bus clock), fans out to in-process subscribers,
then hands off to a pluggable dispatcher. The dispatcher is a no-op
today; the job-runner epic will swap it for a BullMQ-backed async
queue without changing a single producer.

## Event contracts

A discriminated union in `event-contracts.ts` gives producers compile-time
guarantees. Each catalogue entry from `events.ts` has exactly one
variant with a typed `data` payload:

| Event | Payload |
|---|---|
| `RISK_CREATED` | `{ title, score, category }` |
| `RISK_UPDATED` | `{ changedFields: string[] }` |
| `RISK_STATUS_CHANGED` | `{ fromStatus, toStatus }` |
| `RISK_CONTROLS_MAPPED` | `{ controlId, action }` |
| `TEST_PLAN_CREATED` | `{ name, controlId }` |
| `TEST_PLAN_UPDATED` | `{ changedFields }` |
| `TEST_PLAN_PAUSED` / `TEST_PLAN_RESUMED` | `{ fromStatus, toStatus }` |
| `TEST_RUN_CREATED` | `{ testPlanId }` |
| `TEST_RUN_COMPLETED` | `{ testPlanId, result }` |
| `TEST_RUN_FAILED` | `{ findingSummary }` |
| `TEST_EVIDENCE_LINKED` / `TEST_EVIDENCE_UNLINKED` | `{ testRunId, kind? }` |
| `ONBOARDING_*` | `{}` / `{ step }` |

A compile-time assertion (`_catalogueCheck`) fires a TypeScript error
if a new catalogue entry lands without a contract variant, so drift
between `events.ts` and `event-contracts.ts` is impossible.

## Files

| Path | Role |
|---|---|
| `src/app-layer/automation/event-contracts.ts` | Discriminated union, shared metadata shape, `isEvent` narrowing helper, compile-time catalogue-consistency check |
| `src/app-layer/automation/automation-bus.ts` | In-process bus: `emit`, `subscribe`, `setDispatcher`, `reset`, plus `emitAutomationEvent` convenience wrapper |
| `src/app-layer/automation/filters.ts` | `matchesFilter` — simple equality match over `event.data` for `triggerFilterJson` |
| `src/app-layer/automation/index.ts` | Barrel (extended) |
| `src/app-layer/events/risk.events.ts` | Audit emitters now also publish to the bus (4 events) |
| `src/app-layer/events/test.events.ts` | Audit emitters now also publish to the bus (8 events) |
| `src/app-layer/events/onboarding.events.ts` | Audit emitters now also publish to the bus (4 events) |
| `tests/unit/automation.bus.test.ts` | Bus: tenant stamping, subscribe/unsubscribe, wildcard, handler isolation, pluggable dispatcher |
| `tests/unit/automation.event-contracts.test.ts` | Contract narrowing + catalogue completeness at runtime |
| `tests/unit/automation.filters.test.ts` | Filter evaluation: null match, multi-key AND, unknown key fails closed, metadata not filter-addressable |
| `tests/unit/automation.emitter-wiring.test.ts` | Audit emitters fan out to the bus with correct payloads |

## Decisions

- **Wiring via the existing audit emitters, not the usecases.** Every
  usecase already calls `emitRiskCreated(...)`-style helpers after
  mutations. Extending those helpers to also publish to the bus means
  dozens of call sites light up for free — no usecase churn, no risk
  of missing sites. If audit and automation ever need to diverge
  (e.g. an automation-only event that shouldn't enter the audit log),
  a separate emitter can land then.
- **In-process subscribers + pluggable dispatcher is two seams, not
  one.** Subscribers are for synchronous observers (tests, in-memory
  caches, dev-mode logging). The dispatcher is for *async* work —
  rule matching, action execution, retries. Splitting them keeps the
  subscription API useful before the dispatcher exists.
- **tenantId is bus-stamped, not producer-stamped.** `EmitAutomationEvent`
  is `Omit<AutomationDomainEvent, 'tenantId' | 'emittedAt'>` so
  producers literally cannot supply a tenantId — eliminating a whole
  class of cross-tenant leakage bug at the type level. `actorUserId`
  defaults to `ctx.userId` via `??` for the same reason.
- **Handler isolation is unconditional.** A throwing subscriber logs
  and continues; a throwing dispatcher logs and `emit()` still
  returns clean. The contract is "emit never throws" — the dispatcher
  owns retries and execution-row FAILED states.
- **Filter DSL deliberately kept primitive.** `matchesFilter` is
  top-level equality only. Adding ranges / `in` / boolean logic here
  would entrench a half-baked DSL; the moment we need one, land a
  versioned filter language at a new entry point. For Epic 60's
  purposes, equality is enough to prove the bus can connect to the
  dispatcher.
- **Bus is a module-level singleton.** Alternatives (DI container,
  per-request bus) buy nothing here — the bus has no request-scoped
  state, and the singleton makes the convenience wrapper
  (`emitAutomationEvent`) trivially one line at every call site.
  Tests use `resetAutomationBus()` between cases.
- **No dispatcher implementation yet.** The mission brief explicitly
  said not to implement the job-dispatch lifecycle. The `setDispatcher`
  seam means the job-runner epic can plug in without touching
  producers, subscribers, or tests.
