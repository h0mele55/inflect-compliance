# 2026-04-22 — Auth credentials foundation

**Commit:** `06cf533 feat(auth): production-grade credentials authentication foundation`

## Design

Single chokepoint, three layers, no parallel systems:

```
caller (NextAuth authorize / legacy /api/auth/register / future actions)
    └─▶ authenticateWithPassword          ← lib/auth/credentials.ts
            ├─▶ prisma.user.findUnique
            ├─▶ verifyPassword / dummyVerify
            ├─▶ email-verification gate (flag-driven)
            └─▶ silent rehash-on-verify    ← uses lib/auth/passwords.ts
```

Session issuance (JWT cookie) stays where it was — NextAuth handles it via the Credentials provider's return value; the legacy route issues its own legacy cookie. Neither path re-implements password logic.

## Files

| File | Role |
|---|---|
| `src/lib/auth/passwords.ts` | **new** — pure crypto (hash/verify/needsRehash/dummyVerify/validatePasswordPolicy) |
| `src/lib/auth/credentials.ts` | **new** — `authenticateWithPassword` chokepoint |
| `src/auth.ts` | Credentials.authorize delegates to chokepoint; NODE_ENV gate dropped |
| `src/app/api/auth/register/route.ts` | `handleLogin` delegates to chokepoint |
| `src/env.ts` | new `AUTH_REQUIRE_EMAIL_VERIFICATION` flag (default off) |
| `scripts/add-test-user.ts` | bcrypt cost 10 → 12, lockstep with `BCRYPT_COST` |

## Password + session strategy

- **Hashing**: bcryptjs at work factor 12 (OWASP 2024: ≥10). Pure-JS → runs in NextAuth's edge runtime. Algorithm swap to argon2id is a single-file change later; `needsRehash()` + the login-time rehash path migrates users silently on next login.
- **Session issuance**: untouched. JWT strategy, existing JWT callback handles tenant resolution + MFA + session-version check + provider-token refresh.

## Decisions

- **Account-enumeration safety**: every failure reason (unknown email, OAuth-only user with no hash, wrong password, DB error) returns the same `credentials_invalid`. The login UI collapses to the same message.
- **Timing equalisation**: unknown-email path runs a real `bcrypt.compare` against a cached dummy hash so response time doesn't leak account existence.
- **Separate `email_not_verified` reason**: distinct from `credentials_invalid` because once the verification flow ships, legitimate users need to be told "check your inbox" — that's a deliberate leak, not an enumeration vector.
- **Silent rehash-on-verify**: future BCRYPT_COST bumps (or algorithm swaps) migrate users on their next successful login. No mass password reset, no forced-logout event.
- **Policy ≠ login**: `validatePasswordPolicy` gates *setting* a password (register, change, reset). Login doesn't re-validate — pre-existing users whose passwords predate a policy bump aren't locked out.
- **72-byte bcrypt input surprise + memory abuse**: `MAX_PASSWORD_LENGTH = 128` on both hash and verify paths.
- **No enforced char classes** (uppercase/digits/special): NIST 800-63B explicitly deprecates these; length + breach-list screening is the modern guidance. Breach-list screening is a future prompt.
- **Rehash write errors never fail login**: the user proved knowledge of the password; a housekeeping DB hiccup must not invalidate that.
- **NODE_ENV gate dropped**: the Credentials provider is now always registered. Login-page UI auto-hides via `getProviders()` when the server's not configured to expose it.
