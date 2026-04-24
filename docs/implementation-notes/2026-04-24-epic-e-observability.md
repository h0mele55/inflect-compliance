# 2026-04-24 — Epic E: Observability & Operational Hardening

**Commits:**
- `0f08dd3` feat(webhook-headers): shared outbound-webhook header convention
- `1f5a68e` feat(audit-stream): bounded retry with idempotency-key on transient failure
- `31aca12` feat(observability): paired shutdown helpers for telemetry + sentry
- `e1831bc` feat(observability): installShutdownHandlers + per-stage budgets
- `<this commit>` docs(epic-e): operator runbook + impl-note + CLAUDE.md

## Design

Four independent surfaces ship together because each one was load-bearing for
the *next* one's correctness:

```
                            buildOutboundHeaders
                            computeBatchId
                                 │
                                 ▼
audit-stream deliverBatch ◄─ retry loop w/ idempotency-key
                                 │
                                 ▼
                         flushAllAuditStreams ─┐
                         shutdownTelemetry    ─┼── installShutdownHandlers
                         shutdownSentry       ─┘       (SIGTERM / SIGINT)

HIBP_REQUIRED_ROUTES (curated) + structural scan ─── tests/guardrails/hibp-coverage.test.ts
```

Ordering matters: the retry (PR 4) is useless without an idempotency key
(PR 3), because two-identical-deliveries is worse than one-dropped-delivery
for a compliance SIEM. The shutdown handler (PR 6) cannot ship before the
paired shutdown helpers (PR 5) exist — we extended the init modules so
the handler composes *stable* contracts rather than reaching into module
internals.

## Files

| File | Role |
|---|---|
| `src/app-layer/events/webhook-headers.ts` | **NEW.** Single source of truth for outbound-webhook headers. `buildOutboundHeaders`, `computeBatchId`, `OUTBOUND_WEBHOOK_HEADERS` const. |
| `src/app-layer/events/audit-stream.ts` | Retry loop in `deliverBatch`, 1-s/2-s backoff, `isRetryable` = `{0, 408, 429, 5xx}`. Kill-switch via `AUDIT_STREAM_RETRY_ENABLED`. Module-level `_deliveryFailureCount` counter (MVP; PR 6-adjacent work can wire to OTel). |
| `src/env.ts` | `AUDIT_STREAM_RETRY_ENABLED` entry. |
| `src/lib/observability/instrumentation.ts` | Adds `shutdownTelemetry(timeoutMs)`. Stores a `_shutdown` closure during init so the shutdown helper can drain providers without hoisting them to module scope. |
| `src/lib/observability/sentry.ts` | Adds `shutdownSentry(timeoutMs)` — bounded wrapper around `Sentry.close`. |
| `src/lib/observability/shutdown-budget.ts` | **NEW.** Four constants: per-stage budgets + total ceiling. Guardrail-verified. |
| `src/lib/observability/shutdown.ts` | **NEW.** `installShutdownHandlers()` — one-shot idempotent SIGTERM/SIGINT drain. Does NOT `process.exit`. |
| `src/instrumentation.ts` | One-line addition: `installShutdownHandlers()` called from `register()` after init helpers. |
| `tests/guardrails/hibp-coverage.test.ts` | **NEW.** Curated list + structural scan + in-memory mutation regression proof. 4 tests. |
| `tests/guardrails/shutdown-budget-sanity.test.ts` | **NEW.** Sum of stage budgets < ceiling; ceiling ≤ 20 000 ms to leave room for Next HTTP drain. |
| `tests/unit/webhook-headers.test.ts` | **NEW.** 12 tests — header shape, idempotency-key aliasing, batch-id determinism, per-input sensitivity. |
| `tests/unit/audit-stream.test.ts` | Adds retry cases A–D (happy retry, double-fail, network throw, kill-switch). Adds `__setRetryBaseDelayMs` seam to avoid real-time backoff under test. |
| `tests/unit/observability/shutdown-helpers.test.ts` | **NEW.** Noop + idempotence + timeout contracts for the paired helpers. |
| `tests/unit/observability/shutdown.test.ts` | **NEW.** SIGTERM triggers ordered drain, idempotent install, partial-failure isolation. |
| `docs/epic-e-observability.md` | **NEW.** Operator runbook. |
| `CLAUDE.md` | New Epic E section. |

## Decisions

**Retry loop goes in `deliverBatch`, not in `defaultPost`.** `postFn` is a
test seam. If retry lived in `defaultPost`, every test that mocks `postFn`
would silently bypass retry logic — tests would pass while prod behaved
differently. Keeping `postFn` as the single-POST seam and putting the loop
in the caller means tests exercise the real retry path.

**Deterministic batch id is the load-bearing property, not retry.** Retries
without idempotency keys make the consumer SIEM see duplicates — worse
than dropping a batch for audit purposes. The module docstring marks
`computeBatchId` determinism as load-bearing precisely because a future
"simplify" PR that switches to `randomUUID()` would silently destroy
dedup.

**Shutdown handler is `process.once`, not `process.on`.** A container
runtime that escalates (SIGTERM → SIGTERM → SIGKILL) would otherwise
re-enter our handler mid-drain. `once` means the second SIGTERM falls
through to Node's default termination — we stop blocking and let the
process die.

**No `process.exit` in the handler.** `next start` is PID 1 (Dockerfile
uses `exec`). Next installs its own SIGTERM handler for HTTP drain.
Our handler runs in parallel; both finish; event loop empties; Node
exits. Calling `process.exit` would amputate Next's drain mid-request.

**`flushAllAuditStreams` gets the tightest budget — 3 s.** Telemetry and
Sentry are observability-only; losing them on deploy is annoying. The
audit stream carries compliance evidence; losing buffered events is
irreversible. The order (audit → OTel → Sentry) and the budget weights
reflect that ranking.

**HIBP guardrail is a curated list *and* a structural scan.** Curated-only
would let a glob-invisible route slip (e.g. a new auth provider that
accepts password under a non-standard path). Scan-only would fail noisily
on legitimate utility routes. Both together let the failure message
explain exactly which route forgot to register.

**Shutdown budget ceiling is 20 000 ms, not 30 000 ms (k8s default grace).**
The remaining 10 s belong to Next's HTTP drain. A route that hangs in
`onFinish` hooks could still blow the envelope, but that's Next's problem
to bound, not ours.

## What deliberately isn't here

- **OTel meter for `_deliveryFailureCount`.** The counter is module-scope
  and exposed via `__getDeliveryFailureCount` for tests. Wiring to OTel
  is a one-line follow-up that doesn't change the counter's semantics —
  deferred to keep this epic focused.
- **Retry-aware shutdown.** A SIGTERM arriving mid-retry could extend the
  audit flush beyond its budget. `Promise.race` against 3 s catches that.
  A deeper fix — signalling the retry loop to abort on shutdown — is not
  in scope; the race is sufficient for current traffic shapes.
- **Password-reset email rate-limit guardrail** (noted as a Low gap in the
  original analysis). No password-reset routes exist yet; when they land,
  the HIBP guardrail will catch the HIBP-wiring concern, and an
  `EMAIL_DISPATCH_LIMIT` attachment is a one-line `withApiErrorHandling`
  option. Not worth a separate ratchet today.
