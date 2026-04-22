# 2026-04-22 — Epic 60 automation foundation hardening

**Commit:** _(stamped post-commit)_

Closes the Epic 60 backend work. The earlier three notes landed
persistence, the bus, and the dispatch job. This note closes the
audit-named gaps (`automation-schema.test.ts`,
`automation-event-bus.test.ts`), prunes the scaffolding that leaked
into the working state, and lands the contributor-facing guide so
later automation-builder work extends the right primitives.

## Design

The hardening pattern matches Epic 51-59:

```
Shared primitive exists  +  Docs say "use it"  +  Audit-named tests exist
     │                        │                       │
     ▼                        ▼                       ▼
  Usable today           Discoverable              Audit-closed

  @/app-layer/automation docs/automation-events.md  tests/unit/automation-*.test.ts
  (single barrel)        + CLAUDE.md § Epic 60
```

Nothing structurally new — just the boring work that makes the
foundation safe to build on.

## Files

| Path | Role |
|---|---|
| `tests/unit/automation-schema.test.ts` | NEW. 15 tests (3 TS-only enum checks + 12 DB-backed constraint checks). Pins Prisma/Postgres enum parity, unique constraint enforcement, FK RESTRICT behaviour, default values. |
| `tests/unit/automation-event-bus.test.ts` | Renamed from `automation.bus.test.ts` to match the audit-specified filename. No content change. |
| `src/app-layer/automation/types.ts` | Removed dead `AutomationEventPayload` interface — `AutomationDomainEvent` is the canonical producer-side shape and the only thing we used. |
| `src/app-layer/automation/bus-bootstrap.ts` | Removed never-called `_isAutomationBusDispatcherInstalled` + `_resetAutomationBusInstallState` test helpers. |
| `src/app-layer/automation/index.ts` | Barrel pruned to match. |
| `docs/automation-events.md` | NEW. Contributor guide — what Epic 60 provides, four-step "add an event" recipe, emit conventions, extension seams (action handlers, filter DSL evolution), test map, don'ts. |
| `CLAUDE.md` | Added "Epic 60 — Automation Events & Dispatch (backend)" section pointing to the guide so the root contributor entry point surfaces the automation platform. |

## Decisions

- **Renamed the bus test rather than duplicated.** The audit's
  chosen filename (`automation-event-bus.test.ts`) is better for
  discoverability than the original dot-separated style. A rename
  keeps the 13 existing assertions in one place; a duplicate would
  have rotted.
- **Schema test split between always-on and DB-gated.** The three
  TS-only enum-membership checks run in every CI environment and
  catch drift between Prisma's generated types and what downstream
  code assumes. The DB-backed checks run behind `DB_AVAILABLE` so
  local dev and unit-only runs don't block, but CI with Postgres
  proves the actual constraints bite.
- **`AutomationEventPayload` deleted, not deprecated.** It was
  scaffolding I added in the very first pass before the
  discriminated union existed. Zero usages — deprecating would
  have created a "which one do I import" ambiguity for the next
  contributor. One canonical type, clearer guide.
- **CLAUDE.md entry sits next to the existing Epic 60 (UI) entry.**
  Both are Epic 60 work but target different layers — renumbering
  would invalidate every other implementation note. The prose
  makes the backend/UI distinction explicit.
- **Guide uses a four-step recipe, not prose.** Adding an event
  touches four files in a specific order; a numbered recipe is
  harder to get wrong than "make sure everything is consistent".
  Each step is one code block the reader can copy.

## Final Epic 60 position

| Layer | Shipped | Tests |
|---|---|---:|
| Persistence (tables + enums + migration) | ✔ | 15 |
| Repositories + policies | ✔ | 31 |
| Typed event contracts + catalogue | ✔ | 13 |
| In-process event bus | ✔ | 13 |
| Bus → BullMQ wiring | ✔ | 8 |
| Dispatch job + executor registration | ✔ | 9 |
| Usecase emission wiring (risk/test/onboarding/task/issue) | ✔ | 9 |
| End-to-end integration | ✔ | 6 |
| Schema integrity ratchet | ✔ | 15 (new) |
| Contributor guide + CLAUDE.md reference | ✔ | — |
| **Action handlers (CREATE_TASK, NOTIFY_USER, …)** | ⏳ next epic | — |
| **Rule-builder UI** | ⏳ next epic | — |
| **Versioned filter DSL** | ⏳ when needed | — |

**105 passing tests** pin the backbone. The seams for the next
epic are clearly marked in code (`=== Action handlers would plug
in here ===` in `automation-event-dispatch.ts`) and in the guide.
