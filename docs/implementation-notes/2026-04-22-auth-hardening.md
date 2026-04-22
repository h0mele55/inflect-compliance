# 2026-04-22 — Auth hardening + legacy cleanup

**Commit:** _(pending — will stamp on commit)_

Final hardening pass over the credentials path built across the two
previous prompts. Takes the already-production-grade bones (chokepoint,
rate limit, audit, verification) and makes the result operationally
credible end-to-end: no competing login surfaces, documented env
requirements, user-visible verification UX, and a real-DB smoke test
covering the full path.

## Design

Nothing architectural changed at this layer — the chokepoint model from
the foundation prompt stays intact. This pass sharpens edges:

```
Before                                After
──────                                ─────
/api/auth/register handles BOTH       /api/auth/register handles
  register + login (two ways to         register ONLY. All login goes
  authenticate, subtly different        through NextAuth Credentials.
  rate-limit / audit / verification     One surface, one policy.
  semantics)

Login page shows generic              Login page renders verifyStatus
  "Invalid credentials" on              banner (verified / invalid /
  email-not-verified failure —          expired) + resend-verification
  user can't recover                    form below the sign-in toggle

Expired VerificationToken rows        issueEmailVerification folds a
  accumulate indefinitely — no          global delete-where-expired
  cleanup                               into the same transaction that
                                        writes the new token. Plus an
                                        exported pruneExpiredVerification
                                        Tokens() helper for operators.

Env + flag behaviour scattered        docs/auth.md is the single
  across modules, comments, and         operator-facing reference —
  memory notes                          flow diagrams, audit catalog,
                                        env table, pre-prod checklist
```

## Files

| File | Change |
|---|---|
| `src/app/api/auth/register/route.ts` | `handleLogin` removed; dispatcher is register-only |
| `src/lib/schemas/index.ts` | `AuthLoginSchema` deleted; `AuthActionSchema` narrowed to a single-variant union |
| `src/app/login/page.tsx` | Reads `?verifyStatus=` and renders banner (verified / invalid / expired); adds resend-verification form with uniform "If that email is registered..." response |
| `src/lib/auth/email-verification.ts` | `issueEmailVerification` now prunes globally-expired tokens in the same transaction; new `pruneExpiredVerificationTokens()` export for cron/job wiring |
| `src/lib/auth/credential-rate-limit.ts` | `__resetCredentialsRateLimitForTests` also clears `_limiter` + `_initialized` so tests that flip `RATE_LIMIT_MODE` between files get a clean reset point |
| `docs/auth.md` | **new** — operator reference: flow diagrams, audit catalog, env table, pre-prod checklist, operational caveats |
| `tests/integration/credentials-end-to-end.test.ts` | **new** — real-DB smoke test of the full path (verified login, unverified block, wrong password, rate limit trip + reset). Asserts audit rows never carry plaintext email/password |
| `tests/e2e/credentials-hardening.spec.ts` | **new** — Playwright spec for the verifyStatus banners + resend-form uniform response |
| `tests/unit/credentials-auth.test.ts`, `tests/unit/security-events.test.ts` | Typed mocks tightened so the new test cases compile cleanly |

## Decisions

- **Register route narrowed to register-only, not deleted.** The
  response shape (`{ user, tenant, emailVerificationRequired }`) is
  meaningfully different from what NextAuth's callback returns — the
  registration flow creates a tenant + membership atomically, which
  NextAuth's adapter-driven flow can't replicate. Keeping one route
  for registration and one route for login is the clean split.

- **`AuthLoginSchema` exported symbol deleted despite zero consumers.**
  Dead code shouldn't sit in exports waiting to be confused with a
  current endpoint. Commit history preserves it if ever needed.

- **Resend-verification form shown unconditionally** (not only after a
  failed login) because the endpoint's response is uniform regardless
  of registered / verified / rate-limited / mailer-error state. Nothing
  the form reveals leaks account state, so hiding it behind a failure
  signal would just be friction.

- **Global expired-token prune inside `issueEmailVerification`** vs.
  a standalone cron: issuance volume is low enough (once per user ever,
  plus occasional resends) that folding the prune into the same write
  transaction is cheap and guarantees stale rows don't accumulate. The
  `pruneExpiredVerificationTokens()` export is there for operators who
  want to force a sweep without triggering issuance.

- **`__resetCredentialsRateLimitForTests` nukes `_initialized`.**
  Without that, a test file that imports the module under one
  `RATE_LIMIT_MODE` setting can't switch to another mode later — the
  first init wins. The integration test relies on this to force memory
  mode without relying on Upstash being reachable from CI.

- **E2E coverage scoped to UI surface.** The Playwright suite runs with
  `AUTH_TEST_MODE=1`, which bypasses both rate-limit gates and
  disables `AUTH_REQUIRE_EMAIL_VERIFICATION`. Exercising those server-
  side gates through Playwright would require a second test-server
  config. The real-DB integration test covers that territory directly
  (no browser, no Playwright, runs in ~4 seconds).

## Remaining non-blocking caveats

- **Upstash reset-on-success is a no-op.** The `resetCredentialsBackoff`
  call clears the memory-fallback bucket but doesn't issue a
  `redis.del()` against Upstash. Counters age out naturally within the
  15-minute window. Documented in `credential-rate-limit.ts` and
  `docs/auth.md`. Upgrade path is one `redis.del()` call when we start
  caring.

- **Legacy `/api/auth/register` still issues a legacy JWT cookie.**
  The register response sets a cookie via `signToken()` that predates
  NextAuth. Unused by the UI (login page only uses NextAuth's
  `signIn()`), but left in place so any external integration that still
  reads the legacy cookie keeps working. Safe to delete when a
  deprecation window passes.

- **Mailer failures are silent at the register boundary.** If SMTP is
  down, `issueEmailVerification` swallows the error so register still
  returns 200. The operator sees it in pino logs; the user doesn't. A
  future UX improvement: expose `emailSentOk: boolean` in the register
  response so the UI can show a "we couldn't send the verification
  email — contact support" banner. Not critical today since the env
  flag enforcing verification is OFF by default.
