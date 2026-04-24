# 2026-04-24 — Epic E.3: Graceful Shutdown

**Commit:** _(stamped post-commit)_

## Design

On a rolling deploy the process receives SIGTERM. Three observability
surfaces lose data without a drain handler: per-tenant audit-stream
in-memory buffers (events never reach the SIEM — the only copy
outside the audit DB row is in this buffer), OTel span batches in the
`BatchSpanProcessor`, and Sentry errors still queued in the transport.

The fix is one registration point — `installShutdownHandlers()` in
`src/lib/observability/shutdown.ts` — that drains all three in order:

```
SIGTERM → audit flush (3 s budget)
        → shutdownTelemetry (2 s budget)
        → shutdownSentry (2 s budget)
```

Each stage is `Promise.race`'d against its budget so a slow exporter
cannot block the process past the container grace period. The sum of
stage budgets (7 s) fits under the 20 s ceiling in
`shutdown-budget.ts`, leaving the rest for Next.js's own HTTP-drain
handler (which runs in parallel — `next start` calls our signal
handler and continues draining in-flight HTTP requests
simultaneously).

The handler uses `process.once` so a second SIGTERM (common in
container runtimes as an escalation) fires Node's default terminator
instead of re-entering the async chain. It never calls `process.exit`
— the event loop drains naturally once all once-handlers finish.

Idempotency is via a module-level `_installed` flag (same pattern as
`isTelemetryInitialized`). HMR in dev re-imports the module but the
flag prevents double-registration.

## Files

| File | Role |
| --- | --- |
| `src/lib/observability/shutdown-budget.ts` | Four exported constants — per-stage and total ceiling |
| `src/lib/observability/shutdown.ts` | `installShutdownHandlers` + `_resetShutdownInstalledForTesting` |
| `src/instrumentation.ts` | One added import + call after existing init* calls |
| `tests/unit/observability/shutdown.test.ts` | Unit tests — idempotency, call order, partial-failure isolation |
| `tests/guardrails/shutdown-budget-sanity.test.ts` | CI ratchet — stages fit under ceiling, ceiling ≤ 20 s |
| `CLAUDE.md` | Epic E.3 section added after Epic D |

## Decisions

- **Audit first.** The audit buffer is the only loss that cannot be
  recovered from the DB; OTel and Sentry data is already partially
  duplicated in other signals. Ordering reflects severity.

- **`Promise.race` inside audit stage, not `await with timeout`.**
  The audit flush already catches internally. The outer race is the
  backstop in case `flushAllAuditStreams` itself hangs before
  reaching its own error handler.

- **No `process.exit`.** `next start` (not our code) owns when the
  process terminates. Calling `process.exit` from a signal handler
  would bypass any other once-handlers Next registers for its HTTP
  drain. We let the event loop drain naturally.

- **Budget ceiling = 20 s, not 30 s.** k8s `terminationGracePeriodSeconds`
  defaults to 30 s but Next.js needs headroom for its HTTP drain
  (which runs in parallel). 20 s is a conservative ceiling that leaves
  10 s for the HTTP layer without requiring operators to tune k8s config.

- **`process.once` over `process.on`.** A container runtime's
  escalation path is SIGTERM → (grace) → SIGKILL. A second SIGTERM
  means the grace period has passed; blocking in a second async handler
  would be pointless. `once` lets Node's default terminate the process
  immediately on the second signal.
