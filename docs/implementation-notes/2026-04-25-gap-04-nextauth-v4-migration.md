# 2026-04-25 — GAP-04: migrate next-auth v5-beta → v4 stable

**Commit:** `4de1988` (migration) + this hardening commit on branch
`gap-04-nextauth-v4-migration`. Not merged to `main` yet — the
auth-class blast radius warrants a PR review + staging soak.

## Design

The audit's GAP-04 finding was that `package.json` pinned
`next-auth@^5.0.0-beta.30`. The maintainer's `latest` dist-tag is
v4.24.14 — v5 is officially still beta despite shipping in production
at thousands of companies for ~18 months. Enterprise security review
reading the lockfile sees a beta dependency on a security-critical
path and flags it.

We considered three paths:

1. **Pin v5-beta exact + risk-accept** — addresses auto-bump risk but
   not the "running on a beta" finding. Audit doesn't close.
2. **Wait for v5 stable** — release velocity is slowing (5.5 months
   between recent betas), no signal a stable release is imminent.
   Open-ended wait.
3. **Migrate to v4.24.14 stable** — closes the audit, mature, supported,
   battle-tested. Refactor cost ~5 days. **Chosen.**

When v5 ships stable (no `-beta` suffix on the dist-tag), schedule a
forward migration v4 → v5 stable. By then the type augmentation
surface is settled and the migration is once-and-done.

## Files

| File | Change |
|------|--------|
| `package.json` | `next-auth: ^5.0.0-beta.30` → `4.24.14`; `@auth/prisma-adapter: ^2.11.1` → `@next-auth/prisma-adapter: 1.0.7`. Both pinned exactly (no caret). |
| `src/auth.config.ts` | **Deleted**. v4 doesn't need the edge/node split — middleware uses `getToken()` directly. |
| `src/auth.ts` | Rewritten to v4 `NextAuthOptions`. All callbacks ported verbatim. New module augmentations declare both `Session.user` and `JWT` so middleware reads are typed end-to-end. Two compat shims (`auth()`, `signOut()`) preserve the 15+ server-component import surface. Provider rename: `microsoft-entra-id` → `azure-ad`. |
| `src/middleware.ts` | `auth(async (req) => …)` v5 wrapper → `getToken({ req, secret })` v4 direct JWT verification. Five gates preserved (public-path / unauth / admin / MFA / tenant-access). All four `as any` casts on `req.auth` eliminated. |
| `src/app/api/auth/[...nextauth]/route.ts` | `import { handlers } from '@/auth'` → `const handler = NextAuth(authOptions)` + `export const GET = handler`. LOGIN_LIMIT POST wrap preserved. |
| `tests/unit/cors.test.ts` | Mock target updated from deleted `auth.config` to `next-auth/jwt.getToken`. |
| `jest.config.js` | ESM transform allowlist trimmed — v4 ships CJS. |
| `tests/guardrails/auth-stack-pinning.test.ts` | **New (13 assertions)** — locks the dependency pin, the absence of `auth.config.ts`, zero `as any` in auth-critical files, zero ts-suppressions, the JWT augmentation presence, and the v4 provider/middleware/route shape. |
| `CLAUDE.md` (Auth section) | Updated to reflect v4 stack + the augmentation pattern + the compat shims. |
| `docs/auth.md` | Updated to v4. New "Type augmentation" + "Server-side helpers" + "Middleware enforcement" sections. |
| This implementation note | Migration history + rollout playbook. |

## Decisions

**Why v4 and not "pin beta exact + risk-accept".** The audit's narrow
finding is "running on a beta release in production". A risk-accept
shifts that to leadership sign-off but doesn't change the fact in
the lockfile. The audit reviewer reads `package.json` and sees a
non-beta version on the migrated branch — clean closure.

**Why not wait for v5 stable.** The release cadence (beta.30 → beta.31
took 5.5 months) suggests stable is not imminent. Holding production
on a beta indefinitely is the exact risk this change closes.

**Why two compat shims (auth, signOut) instead of churning all 15+
import sites.** Auth-class changes carry inherent risk; minimising
the diff to the call sites keeps review focused on the runtime
behavioural changes, not on import-path churn. Follow-up PR migrates
the call sites to `getServerSession(authOptions)` directly, deletes
the shims, and that PR is purely cosmetic — no behavioural change
inside the auth layer.

**Why a structural ratchet, not just unit tests.** Unit tests verify
that the migrated code BEHAVES correctly. They do not assert that
the codebase is still ON v4. A future "modernise auth" PR that
re-installs v5-beta would pass every existing unit test (because the
behaviour is the same) while quietly reverting the audit closure.
The structural ratchet's 13 assertions catch that class of regression
at static-analysis time.

**Why the JWT augmentation lives in `src/auth.ts` and not a
dedicated `next-auth.d.ts`.** Co-locating with the runtime ensures
the augmentation evolves with the JWT shape — when a future PR adds
a new field to the token, the augmentation update is in the same
diff. A separate `.d.ts` file is easy to forget.

## Rollout playbook

The migration changes the JWT cookie shape between v5-beta and v4.
**Every existing signed-in user will be logged out once on the
deploy that lands this PR.** This is unavoidable — v5-beta and v4
sign cookies with different internal layouts that are not
interoperable.

### Before merging to main

- [ ] **PR review.** Open a PR from `gap-04-nextauth-v4-migration` →
      `main`. Auth-class change; expect 24-48h review window.
- [ ] **Run the full Playwright e2e suite locally** against the
      branch. The suite at `tests/e2e/auth.spec.ts`,
      `tests/e2e/credentials-hardening.spec.ts`, and
      `tests/e2e/admin-sso.spec.ts` exercises real login flows.
- [ ] **Manual provider login verification.**
      - [ ] Google OAuth (sign in, sign out, sign in again)
      - [ ] Microsoft Entra ID via the v4 `azure-ad` provider
      - [ ] Credentials login (happy path + wrong password rate-limit)
      - [ ] SAML/SSO if a test IdP is wired
- [ ] **Manual edge-case verification.**
      - [ ] Tenant-invite redemption on first OAuth sign-in (the
            `inflect_invite_token` cookie path)
      - [ ] MFA challenge enforcement (REQUIRED policy + verify)
      - [ ] Session revocation via admin UI (sessionVersion bump
            forces logout on next request)
      - [ ] OAuth token refresh — wait 60+ minutes after a sign-in
            and verify the next API call succeeds without re-auth
- [ ] **Type/test signal.** `npm run typecheck` clean for `src/` and
      `tests/`. `npx jest tests/unit tests/integration` returns 0
      failures.

### Deploy plan

- [ ] **Schedule during a low-traffic window.** Off-business-hours
      Sunday is conventional for this codebase.
- [ ] **Pre-announce.** Notify the user base 24h ahead that they may
      be logged out once and need to sign in again.
- [ ] **Tag the pre-deploy commit on main as `pre-gap-04-merge`** so
      rollback is `git revert <merge-sha>` + redeploy.
- [ ] **Deploy.** Watchtower polls GHCR every 60s; the container
      auto-pulls. The first user request after the deploy completes
      will see a 401 (cookie shape mismatch) and route to `/login`.
- [ ] **Monitor for the first 24h.**
      - `RefreshTokenError` audit count — should be ~0; spikes
        indicate the OAuth refresh path is misbehaving in v4.
      - `AUTHZ_DENIED` audit count — should match baseline; spikes
        indicate role/membership reads are wrong.
      - `MFA_DEPENDENCY_FAILURE` — should be ~0; spikes indicate the
        MFA enforcement timing changed.
      - Login success rate — pull from `recordLoginSuccess` counts.
        Expect a one-time dip on the deploy day as users re-auth;
        baseline should restore within 24h.
- [ ] **Rollback trigger.** If any auth-class incident lands within
      the first 6h, revert the merge commit and redeploy. Cookie
      shape will revert to v5-beta and re-issued users will need to
      reauth a second time — accept this cost rather than soaking
      a broken auth state.

### Post-deploy follow-ups

- [ ] **Migrate the 15 server-component sites** from `auth()` shim
      to `getServerSession(authOptions)` directly. Cosmetic PR,
      zero runtime change. Once landed, delete the `auth()` and
      `signOut()` shims from `src/auth.ts`.
- [ ] **Schedule a tracking issue** for the v4 → v5-stable forward
      migration. Trigger: `npm view next-auth dist-tags` returns
      `latest: 5.0.0` (no beta suffix).
- [ ] **Update operator runbooks** that mention the v5-beta version
      to reference v4 instead.

## Verification signal at this commit

| Check | Result |
|-------|--------|
| `npm run typecheck` | 0 errors in `src/`, `tests/`. 4 pre-existing `.next/`-generated errors unrelated to this change. |
| `npx jest tests/unit tests/integration` | 9331 / 9331 passing across 335 suites |
| `npx jest tests/guardrails tests/guards` | 2175+ tests passing including the new 13-assertion auth-stack ratchet |
| `as any` count in `src/auth.ts`, `src/middleware.ts`, `src/app/api/auth/[...nextauth]/route.ts` | **0** (was 8 in the v5-beta state) |
| `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck` count in same files | **0** |
| Production-blocking changes for the operator | The JWT cookie shape change. Documented above. |

GAP-04 is closed at the code level. The remaining work is the
rollout playbook above — staging verification, provider login
testing, and a planned production deploy with one-time mass logout.
