# 2026-04-26 — GAP-06: password lifecycle (forgot / reset / change)

**Commit:** to-be-set (GAP-06 series, branched off main at v1.31.0).

Closes the audit's GAP-06 (High severity) by shipping the three
password flows that the credentials-auth path has been missing since
day one — `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`,
`PUT /api/t/:slug/account/password` — plus the supporting token model,
audit events, named rate-limit presets, anti-enumeration timing
machinery, and durable guardrails.

## Design

The credentials path already had every primitive needed to close
the gap. The work was wiring + a single new persistence model:

```
                     ┌──────────────────────────────────────┐
                     │  PasswordResetToken                  │
                     │  ───────────────────────────         │
                     │  id, userId (FK CASCADE),            │
                     │  tokenHash (sha256, unique),         │
                     │  expiresAt, usedAt, requestIp,       │
                     │  createdAt                           │
                     └──────────────────────────────────────┘
                                    ▲
                                    │ atomic claim
                                    │
   ┌──────────────────┐     ┌───────┴──────┐     ┌──────────────────┐
   │ POST /forgot-    │     │ POST /reset- │     │ PUT  account/    │
   │   password       │     │   password   │     │   password       │
   │ FORGOT_PASSWORD_ │     │ PASSWORD_    │     │ PASSWORD_CHANGE_ │
   │   LIMIT          │     │   RESET_LIMIT│     │   LIMIT          │
   │ uniform 200,     │     │ HIBP early,  │     │ HIBP early +     │
   │ 800ms floor,     │     │ atomic claim │     │ progressive      │
   │ anti-enumeration │     │ → setHash +  │     │ lockout on       │
   │                  │     │   sessionVer.│     │ wrong-current,   │
   │                  │     │   bump +     │     │ keep current     │
   │                  │     │   revoke ALL │     │ session, revoke  │
   │                  │     │   sessions   │     │ others           │
   └──────────────────┘     └──────────────┘     └──────────────────┘
            │                       │                       │
            ▼                       ▼                       ▼
         AUTH_PASSWORD_RESET_     AUTH_PASSWORD_         AUTH_PASSWORD_
         REQUESTED                RESET_COMPLETED        CHANGED
         (or _UNKNOWN_TARGET)     (or _FAILED)           (or _CHANGE_FAILED)
```

Token semantics mirror the email-verification pattern from Epic 1
(`src/lib/auth/email-verification.ts`): 32-byte raw token →
sha256 → store hash + expiry; consume hashes the inbound token and
runs the atomic single-use claim. We use a dedicated table rather
than reusing `VerificationToken` because the lifecycles diverge —
shorter TTL (30 min vs 24h), different audit category, and
single-use enforced via `usedAt` (vs `delete-on-consume`).

The atomic single-use shape:

```sql
UPDATE "PasswordResetToken"
SET    "usedAt"    = NOW()
WHERE  "tokenHash" = $1
  AND  "usedAt"    IS NULL
  AND  "expiresAt" > NOW()
```

The first concurrent caller gets `count=1`; the others get `count=0`
and 410. Same SELECT-FOR-UPDATE-via-`updateMany` pattern as
`tenant-invites.ts:redeemInvite`.

Anti-enumeration on forgot-password is two-pronged: (1) uniform 200
response shape regardless of branch, (2) uniform 800ms wall-clock
floor enforced by `padToFloor(startedAt)` inside the usecase. The
fake branches (unknown email / OAuth-only user) run `dummyVerify` to
match the CPU shape of the real branch's bcrypt op. Locked by a unit
test that asserts |real - fake| < 100ms over 3 samples (with one
warm-up to amortise bcrypt module + dummy-hash precompute).

Session invalidation diverges by flow:

| Event | sessionVersion | Current device | Other devices |
|---|---|---|---|
| Reset (unauth) | bump | n/a (user wasn't authenticated) | All revoked, reason `password-reset` |
| Change (auth) | bump | **Preserved** (`revokeOtherUserSessions` excludes the current `UserSession.id`) | All revoked, reason `password-changed` |

Preserving the current device on change is a UX call: forcing logout
on the device the user just used to change their password adds
friction without a security upside. The user already proved
possession of the current password ~2s earlier. Other devices ARE
revoked because credential-stuffing might have produced sessions
elsewhere using the prior password.

## Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | New `PasswordResetToken` model + `User.passwordChangedAt` column + back-relation. |
| `prisma/migrations/20260425200000_add_password_reset_tokens/migration.sql` | Forward-only migration. CASCADE on user delete. Indexes on `tokenHash` (unique), `userId`, `expiresAt`. |
| `src/lib/auth/password-reset-tokens.ts` | **New.** Token primitives — `generateRawResetToken`, `hashResetToken`, `issuePasswordResetToken`, `consumePasswordResetToken`, `pruneExpiredPasswordResetTokens`, `invalidateUserPasswordResetTokens`. |
| `src/lib/auth/password-reset-email.ts` | **New.** `sendPasswordResetEmail(input)` — text + HTML template, mailer-failure-swallowed (mustn't propagate to keep response shape uniform). |
| `src/app-layer/schemas/password.schemas.ts` | **New.** `ForgotPasswordInput`, `ResetPasswordInput`, `ChangePasswordInput` Zod + types. |
| `src/app-layer/usecases/password.ts` | **New.** Three flow orchestrators with HIBP backstop, anti-enumeration timing pad, progressive lockout on change. |
| `src/app/api/auth/forgot-password/route.ts` | **New.** POST, `FORGOT_PASSWORD_LIMIT`, no auth, no HIBP (no password set here). |
| `src/app/api/auth/reset-password/route.ts` | **New.** POST, `PASSWORD_RESET_LIMIT`, token-bound, HIBP-early-rejected. |
| `src/app/api/t/[tenantSlug]/account/password/route.ts` | **New.** PUT, session-bound, `PASSWORD_CHANGE_LIMIT` keyed by userId, HIBP-early-rejected. |
| `src/lib/auth/security-events.ts` | Six new `AUTH_ACTIONS` entries + five new recorders (`recordPasswordResetRequested`, `…RequestedUnknownTarget`, `…Completed`, `…Failed`, `recordPasswordChanged`, `recordPasswordChangeFailed`). |
| `src/app-layer/usecases/session-security.ts` | New `revokeOtherUserSessions(ctx, currentUserSessionId)` helper that bumps `sessionVersion` AND revokes every `UserSession` row except the current device. |
| `src/lib/security/rate-limit.ts` | Three new named presets — `FORGOT_PASSWORD_LIMIT`, `PASSWORD_RESET_LIMIT`, `PASSWORD_CHANGE_LIMIT` — with documented threat model + keying rationale per preset. |
| `src/lib/rate-limit/authRateLimit.ts` | `classifyEndpoint` reclassifies `/api/auth/forgot-password` and `/api/auth/reset-password` to `'high'` tier (10/min, same as signin). |
| `tests/guardrails/hibp-coverage.test.ts` | `HIBP_REQUIRED_ROUTES` adds reset-password + account/password — the ratchet flips from vacuous to load-bearing. |
| `tests/guardrails/password-route-hardening.test.ts` | **New.** Locks each route's named rate-limit preset, scope string, HIBP coverage registration, and the forgot-password schema's password-field-absence (anti-enumeration invariant). |
| `tests/unit/password-reset-tokens.test.ts` | **New.** Pure-crypto unit on the token primitives. |
| `tests/unit/password-anti-enumeration.test.ts` | **New.** Branch-convergence timing assertion (real-vs-fake within 100ms over 3 samples post-warmup). |
| `tests/unit/password-audit-events.test.ts` | **New.** Recorder-shape assertions: action names, hashed-identifier-only payload, reason flow on failure variants. |
| `tests/integration/password-reset-flow.test.ts` | **New.** 9 DB-backed cases: hash-only persistence, prior-token invalidation, atomic single-use, 5-way concurrent claim, expiry, fabricated tokens, full forgot→reset E2E, policy-reject token retention, silent unknown-email branch, silent OAuth-only branch. |
| `tests/integration/password-change-flow.test.ts` | **New.** 6 DB-backed cases: wrong-current reject, same-as-current reject, too-short reject, OAuth-only reject, successful change with current-session preservation, null-current revokes everything. |
| `docs/auth.md` | Password-lifecycle section + presets table + audit catalog rows + MFA-not-cleared rationale. |
| `CLAUDE.md` | Auth section pointer to the new docs. |

## Decisions

**Why a dedicated `PasswordResetToken` table, not `VerificationToken` reuse.**
Different lifecycle semantics: 30-min TTL vs 24h, single-use via
`usedAt` flip vs delete-on-consume, different audit category, different
threat model (account takeover vs email validation). Reusing
`VerificationToken` would couple two flows that should evolve
independently — a future longer-lived passwordless email-link, or a
shorter-lived reset, would push apart again.

**Why hashed token storage despite invite tokens being plaintext.**
Reset tokens grant account-takeover; invite tokens grant tenant
membership. The blast radius of a reset-token DB leak is strictly
greater. The hash adds one sha256 per claim — negligible. Matches
the email-verification convention (which is the closest analogue to
"single-use account-bound token") for code consistency.

**Why uniform 800ms floor for anti-enumeration, not exact branch
matching.** Exact matching is fragile — SMTP latency varies wildly
(5ms console / 100-500ms SMTP / occasional 2s for slow MX), token
issuance is fast (~10-30ms), and CPU bursts on the test runner add
±50ms. A uniform floor sidesteps the timing-arms-race entirely:
attackers can't distinguish branches because the response time is
dominated by the floor, not by the branch. 800ms is comfortably
above the slowest realistic real-user branch (DB write + SMTP) so
both branches converge from below.

**Why preserve the current session on change-password but revoke all
on reset.** On change, the user just proved possession of the
current password — they're authenticated and on a known-good device.
Forcing logout adds friction without a security upside. On reset,
there is no "current device" — the flow starts unauthenticated, so
preserving the originating device makes no sense. We err toward the
safer default of revoking everything.

**Why MFA enrolment is not cleared on reset.** Clearing MFA on
password reset would mean a single email-account compromise (the
recovery factor) defeats the entire 2FA system. The user keeps the
same authenticator app. Users who have lost both password AND MFA
device must contact support — that's an MFA-recovery flow not in
GAP-06's scope. Documented in `docs/auth.md` and in the email body
so support has a runbook.

**Why named presets even when values match LOGIN_LIMIT shape.** Cost
is one declaration each. Benefit: future tuning (e.g. tightening
forgot-password to 3/hour after a real-world abuse incident) stays
local to one preset and doesn't drag login or magic-link with it.
A future "we should consolidate" PR is cheap to do; pre-emptive
consolidation is what causes "why is forgot-password limited at 60
per minute?" incidents.

**Why HIBP at both route layer AND usecase layer.** Defence-in-depth
against direct usecase callers (tests, future admin-driven password
sets, internal tooling) bypassing the breach screen. The cost is one
extra k-anonymity API call per request (~150ms) on a path that's
infrequent by design. The structural HIBP guardrail enforces the
route-layer call; the usecase backstop is a code-review-visible
fail-safe.

**Why the change-password route is tenant-scoped in the URL despite
operating on a user-scoped resource.** The audit prompt asked for
`PUT /api/t/:slug/account/password`, and the UI naturally lives at
`/t/:slug/account/...`. The `tenantSlug` is just routing; the
underlying password is global. The tenant-scope context is
load-bearing in two places: (a) the audit row uses `ctx.tenantId`
for attribution, (b) the `getTenantCtx` membership check ensures
the user really belongs to the tenant they're routing through (a
defence-in-depth check that the JWT claim matches reality).

## Verification signal

| Check | Result |
|-------|--------|
| `npm run typecheck` | 0 errors in `src/`, `tests/`. |
| `tests/unit/password-reset-tokens` | 5 / 5 passing. |
| `tests/unit/password-anti-enumeration` | 1 / 1 passing (3-sample convergence < 100ms post-warmup). |
| `tests/unit/password-audit-events` | 7 / 7 passing. |
| `tests/guardrails/hibp-coverage` | Now covers 3 routes (was vacuous at 1). |
| `tests/guardrails/password-route-hardening` | 9 / 9 passing — preset wiring + scope strings + HIBP cross-registration + anti-enumeration schema invariant. |
| `tests/integration/password-reset-flow` | 9 cases, gated by `DB_AVAILABLE`. Run in CI. |
| `tests/integration/password-change-flow` | 6 cases, same gate. |
| `tests/unit/credentials-auth` etc. | 86 / 86 (no regression in adjacent auth surfaces). |
| HIBP guardrail status | **Load-bearing** as of GAP-06. The structural scan now actively enforces every password-shaped Zod field is registered. |

## Rollout

No production database mutation beyond the migration. Forward-only:
adding a nullable column to `User` and a new table. CASCADE on the
FK means user-delete still works as before. No backfill required —
`passwordChangedAt = NULL` is correct for "never changed" (every
existing user).

The `dummyVerify` precompute at module load means the first
forgot-password request after a cold start incurs ~600ms warm-up.
This is invisible in production (Watchtower auto-pulls; first
request is unlikely to be a forgot-password) but visible in the
integration test, which calls `requestPasswordReset` once before
the timing assertions for that reason.

No mass-logout. No deploy ordering constraints. Ship to staging,
manual sanity check (forgot → email → reset → re-login), then prod.

## Post-deploy follow-ups

- Wire a `/forgot-password` and `/reset-password` UI page (Epic 60
  primitive surface should make this short).
- Add per-tenant policy hooks for `passwordMaxAgeDays` in
  `TenantSecuritySettings` (deferred to v2; defer until a customer
  asks).
- Add an MFA-recovery flow (this is the next gap surfaced by the
  password lifecycle work — the support runbook is documented but
  unautomated).
- Optional: scheduled cron for `pruneExpiredPasswordResetTokens()`
  if row count exceeds 10k.

GAP-06 is closed at the code level + locked at the structural level
via the new `password-route-hardening` guardrail. The HIBP-coverage
ratchet is now load-bearing.
