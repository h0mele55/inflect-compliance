# 2026-04-22 — Auth operational security (rate limit + audit + email verification)

**Commit:** `35b7a1e feat(auth): rate limit + audit + email verification on credentials path`

## Rate limiting strategy

Two gates operating together:

| Layer | Keyed on | Limit | Module | Purpose |
|---|---|---|---|---|
| Per-IP (existing) | IP + UA hash | 10/min | `src/lib/rate-limit/authRateLimit.ts` | Volumetric abuse from a single source |
| Per-identifier (new) | SHA-256(email) | 5 per 15-min sliding window | `src/lib/auth/credential-rate-limit.ts` | Credential-stuffing across rotated IPs |

- Upstash Redis in prod, process-local memory in dev/CI
- **Fail-open** on infrastructure error — losing logins for everyone is worse than dropping one extra attempt
- Both killed together by `AUTH_TEST_MODE=1` or `RATE_LIMIT_ENABLED=0` (one lever for operators)
- **Reset-on-success**: `resetCredentialsBackoff(email)` fires after successful verify so a user who fat-fingered 4× and then typed correctly isn't locked out

## Email verification enforcement

**Token model** — reuses existing NextAuth-shaped `VerificationToken` (identifier / token / expires).

- 32 bytes (256-bit) entropy, hex-encoded; raw sent in email
- SHA-256 → stored in DB; **raw never touches the DB**
- 24h TTL (`VERIFICATION_TOKEN_TTL_MS`)
- Re-issue replaces any prior token for the same email in a single transaction — resends invalidate old links

**Enforcement** — gate lives in `authenticateWithPassword`:
- When `env.AUTH_REQUIRE_EMAIL_VERIFICATION === '1'` AND `user.emailVerified === null`, return `{ ok: false, reason: 'email_not_verified' }`
- Default: **OFF**. Operators flip the env flag once they want the policy live

**Enumeration safety:**
- `/api/auth/verify-email` GET → uniform 302 → `/login?verifyStatus=<verified|invalid|expired>`
- `/api/auth/verify-email/resend` POST → identical 200 + message regardless of registered / verified / rate-limited / mailer-error

## Audit events added

| Action | When it fires |
|---|---|
| `AUTH_LOGIN_SUCCESS` | `authenticateWithPassword` returns ok |
| `AUTH_LOGIN_FAILURE` | Wrong password for known user |
| `AUTH_LOGIN_RATE_LIMITED` | Per-identifier gate tripped for a known user |
| `AUTH_LOGIN_EMAIL_VERIFICATION_REQUIRED` | Gate on, user unverified |
| `AUTH_EMAIL_VERIFICATION_ISSUED` | Token written + email queued |
| `AUTH_EMAIL_VERIFIED` | Token consumed, `emailVerified` set |

**Two-sink routing** (`security-events.ts`):
- Tenant-attributable events → `appendAuditEntry` (hash-chained, per-tenant). Tenant resolved from user's first ACTIVE `TenantMembership`.
- Unknown-user / no-tenant events → `logger.warn` only. Keeps audit tables signal-rich; SREs still get cross-tenant visibility.

## Files

| File | Role |
|---|---|
| `src/lib/auth/credential-rate-limit.ts` | **new** — per-identifier sliding-window gate |
| `src/lib/auth/security-events.ts` | **new** — audit + structured-log emitter, `AUTH_ACTIONS` catalog |
| `src/lib/auth/email-verification.ts` | **new** — token issue / consume |
| `src/app/api/auth/verify-email/route.ts` | **new** — GET consumer, 302 with status flag |
| `src/app/api/auth/verify-email/resend/route.ts` | **new** — POST resend, uniform response |
| `src/lib/auth/credentials.ts` | consult rate-limit, emit events, reset-on-success, expose `rate_limited` reason |
| `src/app/api/auth/register/route.ts` | `validatePasswordPolicy`, issue verification token, `emailVerificationRequired` in response |

## Decisions

- **Privacy invariants** enforced by tests: plaintext email never in audit `detailsJson` or structured logs — only a deterministic SHA-256 hash (`hashEmailForLog`). `userId` omitted from `unknown_email` log line.
- **No raw tokens in logs or audit** — only the fact that an event happened.
- **Audit-write errors never propagate** — fall back to `logger.warn`. A DB hiccup must not fail the auth path.
- **Register issues verification tokens even when the gate is off** — so flipping `AUTH_REQUIRE_EMAIL_VERIFICATION=1` later doesn't strand newly-registered users without a way to verify.
- **Mailer failures swallowed inside `issueEmailVerification`** — register response shape stays stable; operator sees mailer failures in pino logs. Resend endpoint also returns uniform 200 regardless of mailer outcome.
- **`rate_limited` reason surfaces a typed `retryAfterSeconds`** on the `AuthResult`; NextAuth's `authorize` still collapses to `CredentialsSignin`. Callers that want to surface the retry-after header (future API route) invoke `authenticateWithPassword` directly.
