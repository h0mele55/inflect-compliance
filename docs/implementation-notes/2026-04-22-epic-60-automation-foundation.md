# 2026-04-22 — Epic 60 automation data model & domain events (foundation)

**Commit:** _(stamped post-commit)_

Backend foundation for the event-driven automation layer. Everything
downstream — the dispatcher, the builder UI, the per-rule history
feed, the manual-replay admin tool — will stand on these two tables
and the small app-layer module that wraps them.

## Design

Two append-only tables, one catalogue, one policy matrix. No
dispatcher yet, no usecase wiring, no API surface — deliberately
thin so the shape can still be reshaped once the first real rule
type lands.

```
 ┌──────────────────┐    ┌──────────────────┐     ┌─────────────────────┐
 │ AutomationRule   │    │ AutomationExec   │     │ events.ts           │
 │ (tenant-owned,   │◄───│ (append-only     │     │ (producer-side      │
 │  soft-delete)    │    │  history, per    │     │  catalogue of event │
 │                  │    │  fire attempt)   │     │  names — typos at   │
 └────────┬─────────┘    └────────┬─────────┘     │  emit, not runtime) │
          │                       │               └─────────────────────┘
          └───────────┬───────────┘
                      ▼
          ┌──────────────────────┐
          │ app-layer/automation │
          │   policies.ts        │   ADMIN manages, EDITOR replays,
          │   AutomationRuleRepo │   READER reads, AUDITOR reads history
          │   AutomationExecRepo │
          └──────────────────────┘
```

Key shape decisions:

- **Trigger event is a free-form string in the DB.** New events emit
  without a migration. The catalogue (`events.ts`) is the compile-time
  contract on the *producer* side; rules carrying a typo silently
  never fire, which is the right failure mode vs. breaking the
  producer.
- **Action config is JSON, action class is an enum.** Adding a
  webhook header field is a code change, not a migration. Adding
  `SCIM_PUSH` as a new action class is a migration — the enum change
  is the whole point of the gate.
- **Idempotency key is unique per tenant when set.** Insert-to-claim
  pattern: a retried event hits P2002 and the second runner skips.
  Null-allowed so manual replays and admin-triggered re-fires don't
  have to compute a key.
- **Denormalised triggerEvent on execution.** Keeps the event-feed
  index single-column and keeps the row legible after the rule it
  belonged to is archived.
- **Soft-delete via `deletedAt`, status=`ARCHIVED`.** Execution
  history outlives the rule definition so audit trails stay intact;
  the unique `[tenantId, name]` constraint is kept simple, so
  re-using a name requires a hard-delete of the archived row.

## Files

| Path | Role |
|---|---|
| `prisma/schema.prisma` | AutomationRule + AutomationExecution models, three enums, Tenant back-relations |
| `prisma/migrations/20260422170000_automation_foundation/migration.sql` | Manual-authored migration (not `prisma migrate dev` output) — tables, 12 indexes, FKs, enums |
| `src/app-layer/automation/events.ts` | Producer-side catalogue of trigger event names + `isKnownAutomationEvent` guard |
| `src/app-layer/automation/types.ts` | Discriminated-union action configs, input DTOs, filter shapes |
| `src/app-layer/automation/policies.ts` | `assertCanReadAutomation` / `assertCanManageAutomation` / `assertCanExecuteAutomation` / `assertCanReadAutomationHistory` |
| `src/app-layer/automation/AutomationRuleRepository.ts` | Tenant-scoped CRUD, dispatcher-hot-path finder, archive, counter bump |
| `src/app-layer/automation/AutomationExecutionRepository.ts` | Insert-to-claim `recordStart`, `markRunning` pending-guard, `recordCompletion`, per-rule feed |
| `src/app-layer/automation/index.ts` | Barrel export |
| `tests/unit/automation.policies.test.ts` | Full role matrix (ADMIN / EDITOR / READER / AUDITOR) against all four assertions |
| `tests/unit/automation.events.test.ts` | Catalogue integrity: no duplicates, no empties, key===value, guard behaviour |
| `tests/unit/automation.repositories.test.ts` | Mocked-Prisma query shape ratchets: tenant filter on every call, soft-delete exclusion, idempotency, append-only |

## Decisions

- **Skipped a Zod schema file this round.** Validation will attach to
  the future API surface; writing schemas before there's a caller is
  speculative. The types in `types.ts` are enough to type-check the
  repo layer.
- **No usecase file yet.** The four operations a dispatcher + builder
  will want (`createRule`, `updateRule`, `archiveRule`, `replayRule`)
  all currently have the same shape: `policy → repo → audit`. Writing
  them before the dispatcher exists would fix a shape that needs to
  stay malleable.
- **`recordFired` bypasses `updatedByUserId` on purpose.** It's a
  counter-only side effect of dispatch, not a user action. Keeping
  every user-visible mutation behind `update()` means audit-log
  coverage stays tight without the dispatcher flooding logs.
- **Unit tests, not integration.** The invariants that matter at
  this layer — tenant filter, soft-delete exclusion, insert-to-claim
  semantics — are all query-shape invariants. A mocked Prisma client
  pins them cheaply. Once the dispatcher lands, integration tests
  will cover the through-the-stack behaviour against a real DB.
- **`createdByUserId` / `updatedByUserId` are plain scalars, not
  User relations.** Same pattern as `Task.createdByUserId` — users
  can be deleted without dropping the rule, and the rare lookup is
  cheap enough to do manually.
