# 2026-04-25 — GAP-02 closure: usecase coverage ratchet

**Commits:** `5439aa3` (Wave 1), `c52cb75` (Waves 2+3), `6af5633` (Wave 4),
plus this PR (ratchet + docs).

## Design

GAP-02 in the enterprise audit identified usecase-layer coverage as
critically low — 17/14/27/24% (branches/functions/lines/statements)
on `src/app-layer/usecases/`. The audit recommended a ratchet that
only goes up. The pre-closure floor in `jest.config.js` had been
calibrated DOWN to match observed reality on 2026-04-22, which gave
the right structural shape (ratchet policy in place) but the wrong
height (no headroom for future regressions to exceed before failing
CI).

The closure landed in four waves of unit tests targeting the
risk-ranked top-20 usecases:

```
Wave 1   3 files,  34 tests   mfa-challenge / mfa-enrollment / data-portability
Wave 2   6 files,  67 tests   api-keys / evidence{,-retention} / finding /
                              mfa-policy / policy
Wave 3   5 files,  79 tests   risk / audit / audit-hardening / integrations /
                              tenant-lifecycle
Wave 4  10 files, 113 tests   task / issue / vendor / risk-suggestions /
                              onboarding / session-security / file /
                              control-mutations / audit-readiness-cycles /
                              framework-install
                  ──────
                  293 tests across 24 suites
```

This PR converts the coverage gain into a durable, CI-enforced
floor and documents the next tranche of high-risk uncovered files
so they don't quietly slip back out of sight.

## Files

| File | Role |
|------|------|
| `jest.config.js` | Per-path thresholds raised; ratchet policy + contributor expectations expanded inline. |
| `docs/implementation-notes/2026-04-25-gap-02-usecase-ratchet.md` | This note. |

## Decisions

**Why inline comments and not a standalone `usecase-testing.md`.** The
`coverageThreshold` block in `jest.config.js` is the single point
where the ratchet is enforced. A separate doc would be a second source
of truth at risk of drifting. The inline comment block carries the
contributor guidance + ratchet semantics + last-measured numbers, all
in the file the contributor edits when they want to change a
threshold. The implementation note (this file) records the
*decisions and rationale* — the why-it-changed history that doesn't
belong in a config file comment.

**Why the buffer is small (~2-3% below observed).** The pre-closure
calibration set the floor exactly at observed (zero buffer). That's
strict-ratchet — a single test deletion that drops coverage by 0.01%
fails CI and forces a public conversation. We keep that strict
posture but add a sliver of buffer (2-3%) to absorb the run-to-run
jitter we saw when comparing different test-scope subsets — without
it, parallelisation flakes that exclude a single test file would
break CI without reflecting a real regression.

**Why functions threshold is the lowest gain.** Many usecase modules
expose 30-50 small functions where most are thin wrappers (list /
get / metrics) that share infrastructure with the tested write
paths. The marginal gain from testing a `listX` that only calls
`assertCanRead + repository.list` is low. We focus the tests on
mutation paths, audit emission, sanitisation gates, and tenant-scope
checks — those move the branches / lines numbers significantly while
leaving the functions number lower because list-shaped functions stay
uncovered. This is acceptable: functions is the noisiest of the four
metrics and the one most affected by repo conventions (some teams
write many tiny functions, some write few large ones).

**Why we do not raise the global floor.** The 2026-04-22 lowering of
global branches 60→55 and functions 60→58 was tied to Epic 57–60 UI
primitive code being included in the `collectCoverageFrom` globs but
not exercised by the node-suite tests. That structural reason is
unchanged. The usecase coverage ratchet is the durable lever for
GAP-02 specifically; the global will lift naturally as `src/lib/`
coverage tightens in a future hardening pass.

## Remaining high-risk uncovered usecases

The following usecases scored highly on the GAP-02 risk model
(auth-sensitive + tenant-scoped + branchy + heavily mutating) but
are not yet covered by Waves 1-4. Each is a candidate for a Wave 5
in a future hardening pass:

| Usecase | Lines | Why it matters |
|---------|------:|----------------|
| `sso.ts` | 565 | SSO assertion validation, IdP metadata import, attribute mapping. Auth surface — bypass = silent tenant join. |
| `scim-users.ts` | 557 | SCIM user provisioning. Cross-tenant id manipulation = cross-tenant membership grant. |
| `audit-readiness-scoring.ts` | 543 | Computes the score auditors and CISOs see. A bug here is a wrong number on every dashboard. |
| `gap-analysis.ts` | 531 | Maps controls to framework requirements. Wrong mapping = false coverage claims. |
| `webhook-processor.ts` | 484 | Inbound webhook dispatcher. Mis-routing = events lost or duplicated. |
| `editable-lifecycle-usecase.ts` | 479 | Soft-delete / restore / purge fan-out. Wrong scope = cross-tenant delete. |
| `audit-readiness/packs.ts` | 476 | Pack lifecycle: freeze, share, item snapshot. Frozen-pack mutation = audit-trail corruption. |
| `control-test.ts` | 475 | Test-plan create / update with sanitisation. Was on the Wave 2 list, deferred. |
| `tenant-invites.ts` | 436 | Invite token mint / redeem / revoke. Already audit-covered at the redeem path; mint + revoke gaps remain. |
| `test-hardening.ts` | 377 | Step-locking and result hash chaining. Chain regression = audit-pack corruption. |
| `onboarding-automation.ts` | 377 | Phase-2 automation actions (framework install, asset import). Idempotency-critical. |
| `tenant-admin.ts` | 348 | Member role + status mutations. Already partially covered via tenant-lifecycle; member-mutation paths remain. |
| `framework/coverage.ts` | 326 | Coverage computation. Wrong number = misled compliance team. |
| `soa.ts` | 320 | Statement of Applicability — the document that goes to external auditors verbatim. |
| `custom-roles.ts` | 307 | Custom role permission resolution. Wrong overlay = privilege escalation. |

When a Wave 5 PR lands, this list should shrink and the ratchet
should be raised again to lock in the gain. Repeat until exhausted.
