# 2026-04-23 — Epic C: GitLab-style Defense-in-Depth

**Commit:** _(stamped post-commit)_

Five complementary security controls landed across one cohort:

| Sub-epic | What |
| --- | --- |
| C.1 | Permission-key API middleware + declarative route map + CI guardrail |
| C.2 | Local pre-commit + CI secret detection sharing a single pattern file |
| C.3 | Operational session table + concurrent-session limits + max-duration policy + admin members-page UI |
| C.4 | Outbound audit-event streaming with per-tenant config, batching, HMAC signing |
| C.5 | Server-side rich-text sanitisation + SECURITY.md disclosure policy |

The premise of "defense-in-depth" is that any single control will
eventually fail; the surrounding controls have to keep the system
safe. The notes below document the design seams that make the five
controls reinforce each other rather than overlap.

## Design

### One declarative source per concern

A repeated pattern in this Epic: the security policy lives in a
single declarative source that a guardrail test verifies the
codebase still matches.

- **Route → permission:** `src/lib/security/route-permissions.ts`
  is the single source of truth that
  `tests/guardrails/api-permission-coverage.test.ts` compares
  against `src/app/api/**` on every CI run.
- **Secret patterns:** `.secret-patterns` is read by both the bash
  scanner and the jest guardrail. No drift surface.
- **Encrypted fields:** the existing Epic B
  `src/lib/security/encrypted-fields.ts` manifest gained the new
  `TenantSecuritySettings.auditWebhookSecretEncrypted` entry — the
  middleware encrypts on write / decrypts on read transparently.
- **Sanitiser allowlist:** the tag/attribute/scheme lists are
  declared at the top of `src/lib/security/sanitize.ts`; the test
  suite asserts dangerous payloads are stripped AND legitimate
  formatting survives.

### Layered, not stacked

Each control fails open on its own telemetry surface and fails
closed on its access decision:

- C.1 permission denial — if `appendAuditEntry` for the AUTHZ_DENIED
  row throws, the 403 still reaches the client. Telemetry failure
  doesn't trade the denial.
- C.3 sign-in — `recordNewSession` swallows DB errors and returns a
  placeholder rowId so a Prisma blip can't lock anyone out.
  `verifyAndTouchSession` is fail-open on DB read errors. The
  classic `User.sessionVersion` check remains as a backstop.
- C.4 streaming — the audit row is committed BEFORE the stream
  call. A broken SIEM cannot undo the audit write; failed POSTs
  log a warning and drop the batch.

### The audit category gotcha (drive-by fix)

The audit-details schema (`src/app-layer/schemas/json-columns.schemas.ts`)
defines a closed enum of categories: `entity_lifecycle | data_lifecycle
| status_change | relationship | access | custom`. The first version
of `permission-middleware.ts` used `category: 'security'` for
AUTHZ_DENIED entries; `validateAuditDetailsJson` silently rejected
them and the `try/catch` in the middleware swallowed the throw — so
denials WERE blocking access but their audit rows weren't being
written. Caught by the route-level enforcement test
(`tests/unit/security/admin-route-enforcement.test.ts`) where the
audit assertion failed against an actual route handler.

Fixed by switching to `category: 'access'` (the canonical value for
authn/authz events) in both `permission-middleware.ts` and
`admin/sessions/route.ts`. Reviewers adding new security-related
audit events should default to `'access'`; if you genuinely need a
new category, extend the enum first.

### Per-tenant policy beats global env vars

C.3 (concurrent + duration) and C.4 (webhook URL + secret) are
configured per-tenant on `TenantSecuritySettings`, not via global
env vars. Rationale:

1. A SaaS tenant's compliance team has a different threat model
   than another's — same install, different defaults.
2. The settings UI is the operator's affordance; env-only knobs
   require a code+deploy change for what should be a click.
3. Encryption-at-rest for the HMAC secret rides Epic B's manifest
   automatically; an env var would have needed bespoke handling.

The trade-off is that we can't kill-switch C.3/C.4 globally. The
runbook documents the per-tenant rollback (`UPDATE … SET
maxConcurrentSessions = NULL`).

## Files

| File | Role |
| --- | --- |
| `prisma/schema.prisma` | New `UserSession` model; `TenantSecuritySettings` columns: `maxConcurrentSessions`, `auditWebhookUrl`, `auditWebhookSecretEncrypted` |
| `prisma/migrations/20260423120000_epic_c3_user_session/` | UserSession table |
| `prisma/migrations/20260423130000_epic_c3_session_limits/` | maxConcurrentSessions column |
| `prisma/migrations/20260423140000_epic_c4_audit_webhook/` | webhook URL + encrypted secret columns |
| `src/lib/security/permission-middleware.ts` | C.1 — `requirePermission(...)` + helpers |
| `src/lib/security/route-permissions.ts` | C.1 — declarative route → permission map |
| `src/lib/security/session-tracker.ts` | C.3 — record / verify / revoke / list / count helpers + policy enforcement |
| `src/lib/security/sanitize.ts` | C.5 — `sanitizeRichTextHtml` / `sanitizePlainText` / `sanitizePolicyContent` |
| `src/lib/security/encrypted-fields.ts` | Manifest gained `TenantSecuritySettings.auditWebhookSecretEncrypted` |
| `src/lib/audit/audit-writer.ts` | Lazy-imports + invokes `streamAuditEvent` after commit |
| `src/app-layer/events/audit-webhook.ts` | C.4 — per-tenant in-memory buffer, 100/5s flush, HMAC signing, fail-safe POST |
| `src/auth.ts` | NextAuth `jwt` callback hooks `recordNewSession` (first mint) + `verifyAndTouchSession` (every pass) |
| `src/app/api/t/[tenantSlug]/admin/sessions/route.ts` | C.3 — GET (with optional `?userId=`) + DELETE |
| `src/app/api/t/[tenantSlug]/admin/*/route.ts` (×12) | Migrated from `requireAdminCtx` to `requirePermission(<key>, …)` |
| `src/app-layer/usecases/tenant-admin.ts` | `listTenantMembers` attaches per-user `activeSessionCount` |
| `src/app-layer/usecases/policy.ts` | `createPolicy` + `createPolicyVersion` route through `sanitizePolicyContent` |
| `src/app-layer/usecases/task.ts` | `addTaskComment` routes through `sanitizePlainText` |
| `src/app-layer/usecases/issue.ts` | `addIssueComment` routes through `sanitizePlainText` |
| `src/app/t/[tenantSlug]/(app)/admin/members/page.tsx` | Sessions column + modal + revoke handler |
| `src/app/t/[tenantSlug]/(app)/admin/scim/page.tsx` | Eager `#scim-endpoint-url` slot for E2E determinism |
| `.husky/pre-commit` | Cheap-first secret scan + lint-staged |
| `scripts/detect-secrets.sh` | C.2 — bash scanner; loads `.secret-patterns` |
| `.secret-patterns` | C.2 — single source of truth for both scanners |
| `tests/guardrails/api-permission-coverage.test.ts` | C.1 — verifies route ↔ map sync |
| `tests/guardrails/no-secrets.test.ts` | C.2 — repo-wide secret scan |
| `tests/guardrails/admin-route-coverage.test.ts` | Legacy guardrail extended to accept `requirePermission` |
| `tests/guardrails/sanitize-rich-text-coverage.test.ts` | C.5 — verifies known rich-text usecases keep their sanitiser import |
| `tests/unit/security/permission-middleware.test.ts` | C.1 — middleware behaviour |
| `tests/unit/security/admin-route-enforcement.test.ts` | C.1 — end-to-end through `withApiErrorHandling` |
| `tests/unit/security/detect-secrets.test.ts` | C.2 — bash scanner positives + negatives |
| `tests/unit/security/session-tracker.test.ts` | C.3 — tracker + policies + helpers |
| `tests/unit/security/admin-sessions-route.test.ts` | C.3 — route end-to-end |
| `tests/unit/security/sanitize.test.ts` | C.5 — sanitiser profiles + XSS payloads |
| `tests/unit/security/sanitize-write-paths.test.ts` | C.5 — write-path wiring |
| `tests/unit/audit-webhook.test.ts` | C.4 — payload, batching, HMAC, fail-safe |
| `SECURITY.md` | Disclosure policy |
| `docs/epic-c-security.md` | Operator runbook |
| `CLAUDE.md` | New "Defense-in-Depth (Epic C)" section pointing to the primitives + runbook |

## Decisions

- **Permission key model over role tiers for C.1.** The legacy
  `requireAdminCtx` checks role enum (ADMIN > EDITOR > AUDITOR >
  READER) and works fine, but it doesn't compose with custom roles.
  `requirePermission(<key>)` reads `appPermissions` (already
  custom-role-aware) so the same wrapper covers built-in roles,
  custom roles, and future API-key scopes.

- **Generic 403 message, structured audit row.** The 403 body is
  literally `"Permission denied"` — never echoes the missing key.
  An attacker can't enumerate the namespace by probing routes. The
  AUTHZ_DENIED audit entry carries the exact key for the security
  reviewer.

- **Revoke-oldest, not deny-new, on session overflow.** A stolen
  device cannot keep the legitimate user locked out — they sign
  in, the hijacked session dies. Documented in the
  `evictOldestSessionsToFit` comment so a future operator can
  flip the policy if their threat model demands it.

- **Per-process audit-stream buffer.** Considered a Redis-backed
  buffer for cross-instance coalescing; deferred. Rationale: the
  audit write itself is durable (committed in Postgres before the
  stream call), so the streamer is a side-view, not a transport.
  At-least-once-per-process is acceptable; the swap point is one
  function (`getBuffer`) if cross-process coalescing later becomes
  necessary.

- **`sanitize-html` over DOMPurify+jsdom.** Runs natively on Node
  without a DOM polyfill, smaller bundle, declarative allowlist
  API that's easier to review in code review. The de-facto Node.js
  sanitiser used by GitHub, npm, Sentry.

- **Two sanitiser profiles (rich-text + plain-text), not one
  super-profile.** A single permissive profile that the markdown
  renderer / PDF generator could relax further is exactly the
  attack surface to avoid. Forcing the call site to pick is a
  feature, not friction.

- **Guardrail tests are written as data-driven `test.each`** so a
  new admin route or a new write path that omits the sanitiser
  shows up as a single failure with `file:line` and copy-paste-
  ready remediation. Reviewer cost is one line.
