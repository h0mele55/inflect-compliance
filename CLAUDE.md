# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev               # Start Next.js dev server
npm run build             # Validate env + build
npm run typecheck         # tsc --noEmit
npm run lint              # Next.js lint

# Database
npm run db:generate       # Regenerate Prisma client after schema changes
npm run db:push           # Push schema to DB (no migration file)
npm run db:migrate        # Create + apply a named migration interactively
npm run db:reset          # Drop, recreate, and reseed the DB

# Tests
npm test                  # Jest (parallel)
npm run test:ci           # Jest (sequential, used in CI)
npm run test:coverage     # Jest with coverage report
npm run test:e2e          # Playwright browser tests

# Run a single Jest test file
npx jest tests/unit/golden-path.test.ts

# Run a single Playwright test file
npx playwright test tests/e2e/core-flow.spec.ts

# Docker (local dev stack — PostgreSQL + Redis)
docker-compose up -d
```

## Architecture

### Layer Structure

```
src/app/api/           → Next.js route handlers (HTTP boundary only — parse input, call usecases, return responses)
src/app-layer/usecases/→ Business logic orchestration (thin: validate → call policy → call repo → emit event)
src/app-layer/policies/→ Authorization checks (assertCanRead/Write/Admin/Audit) — always called before data access
src/app-layer/repositories/ → All Prisma queries (every query must filter by tenantId)
src/app-layer/jobs/    → BullMQ job definitions (background tasks)
src/app-layer/services/→ Cross-cutting domain services (library import, cross-framework traceability)
src/app-layer/events/  → Audit event writers (immutable, hash-chained audit trail)
src/lib/               → Shared infrastructure (auth, observability, storage, rate-limiting, permissions)
src/components/        → React components
```

### Request Context (`RequestContext`)

Every usecase and repository receives a `RequestContext` (defined in `src/app-layer/types.ts`) containing `userId`, `tenantId`, `role`, `permissions`, and `appPermissions`. This is propagated via AsyncLocalStorage — never thread through manually. Access via `getRequestContext()` from `src/lib/observability`.

### Multi-Tenant Isolation

Two layers, both load-bearing:

1. **PostgreSQL Row-Level Security** (Epic A.1). Every tenant-scoped
   table has `tenant_isolation` + `superuser_bypass` policies and
   `FORCE ROW LEVEL SECURITY`. Tenant context is bound per-transaction
   via `runInTenantContext` from `@/lib/db/rls-middleware`. The DB
   returns zero rows if the context is unset on an `app_user`
   session — isolation is architecturally impossible to bypass by
   accident. **See `docs/rls-tenant-isolation.md`** for the full guide
   including the bypass model, the policy shapes for nullable /
   ownership-chained tables, and how to add a new tenant-scoped model.

2. **Application-layer `tenantId` filters** — every repository query
   also filters by `tenantId`. Defence in depth; makes error messages
   clear when the app is working correctly.

Guard tests: `tests/guardrails/rls-coverage.test.ts` (DB-backed — CI
fails if a tenant table is missing RLS) and
`tests/unit/tenant-isolation-structural.test.ts` (code-pattern scanner).

### API Rate Limiting (Epic A.2)

Every route wrapped with `withApiErrorHandling` gets
`API_MUTATION_LIMIT` (60/min) on POST/PUT/DELETE/PATCH by default.
Stricter presets (`LOGIN_LIMIT`, `API_KEY_CREATE_LIMIT`,
`EMAIL_DISPATCH_LIMIT`) are applied via `{ rateLimit: { config, scope } }`
options on specific routes. Reads are never rate-limited by this
layer. 429 responses carry `Retry-After` + `X-RateLimit-*` +
`x-request-id`. Bypass via `RATE_LIMIT_ENABLED=0` env or inside tests
(automatic). All presets live in `src/lib/security/rate-limit.ts`;
the wrapper is `src/lib/security/rate-limit-middleware.ts`.

### Auth Brute-Force Protection (Epic A.3)

`authenticateWithPassword` applies `LOGIN_PROGRESSIVE_POLICY`:
3 failures → 5s delay, 5 → 30s, 10 → 15-min lockout. Timing is
equalised via `dummyVerify` so lockout is indistinguishable from
wrong-password. Signup rejects known-breached passwords via
`checkPasswordAgainstHIBP` (k-anonymity, fail-open on HIBP outage).
Password change / reset routes do not exist yet; when they land,
wire HIBP the same way.

**See `docs/epic-a-security.md`** for the unified operator runbook
(verification commands, rollback procedure, observability signals)
and `docs/rls-tenant-isolation.md` for the RLS deep dive.

### Field Encryption (Epic B)

Business-content fields (Finding.description, Risk.treatmentNotes,
PolicyVersion.contentText, TaskComment.body, …) are encrypted at
rest by a Prisma `$use` middleware. The manifest lives in
`src/lib/security/encrypted-fields.ts`; **never** add or remove
encrypted columns outside it. Add a model here ⇒ its manifest
fields encrypt on every write and decrypt on every read
transparently.

Key hierarchy: `DATA_ENCRYPTION_KEY` (master KEK) wraps a per-tenant
DEK on `Tenant.encryptedDek`. New tenants get a DEK at creation via
`createTenantWithDek` (from `src/lib/security/tenant-key-manager.ts`);
existing tenants get one via `scripts/generate-tenant-deks.ts`.
Ciphertexts carry `v1:` (global KEK, legacy) or `v2:` (per-tenant
DEK) envelope — the middleware dispatches per-value on read.

Master-KEK rotation: set `DATA_ENCRYPTION_KEY_PREVIOUS` alongside
the new primary. `decryptField` falls back transparently. Admins
trigger per-tenant rotation via
`POST /api/t/{slug}/admin/key-rotation`, which enqueues the
background job in `src/app-layer/jobs/key-rotation.ts`. When every
tenant reports zero `v1:` rows under the old key, remove
`DATA_ENCRYPTION_KEY_PREVIOUS` from env.

**See `docs/epic-b-encryption.md`** for deployment order,
rotation runbook, observability signals, rollback procedure, and
the full test coverage map.

### Defense-in-Depth (Epic C)

Five complementary controls. Treat them as one system — each
sub-epic has the others as backstops.

**C.1 — API permission middleware.** Wrap every privileged API
handler with `requirePermission(<key>, …)` from
`@/lib/security/permission-middleware`. The key is a typed dotted
literal (`'admin.scim'`, `'risks.create'`, …) derived from
`PermissionSet`. Denials emit a hash-chained `AUTHZ_DENIED` audit
entry (`category: 'access'`) and surface as a generic 403 — the
key itself is never echoed to the client. The route ↔ map sync is
guarded by `tests/guardrails/api-permission-coverage.test.ts`;
new admin/privileged routes MUST add a rule in
`src/lib/security/route-permissions.ts` and use
`requirePermission(...)`. Avoid the legacy
`requireAdminCtx` helper for new code — it still works but the
permission-key model is the canonical pattern.

**C.2 — Secret detection.** Local pre-commit hook
(`.husky/pre-commit` → `scripts/detect-secrets.sh`) scans staged
files; CI guardrail (`tests/guardrails/no-secrets.test.ts`) walks
the whole tree. Both load patterns from `.secret-patterns` (one
source of truth). Carve-outs: inline
`// pragma: allowlist secret` for one-off lines, or move fixtures
under `tests/fixtures/secrets/` (auto-skipped). Pre-existing
placeholder fixtures live in `REPO_BASELINE` in the guardrail; add
to that array only with a written `reason`.

**C.3 — Session hardening.** A `UserSession` row is minted on every
sign-in (NextAuth `jwt` callback → `recordNewSession`) carrying
`ipAddress`, `userAgent`, `expiresAt`, `lastActiveAt`. Every JWT
pass calls `verifyAndTouchSession` — revoked or expired rows
short-circuit as `SessionRevoked`. Per-tenant policy lives on
`TenantSecuritySettings.maxConcurrentSessions` (overflow → revoke
oldest by `lastActiveAt` ASC) and `sessionMaxAgeMinutes` (caps
`expiresAt` at insert time). The admin UI lives at
`/admin/members` — Sessions column + modal + per-row revoke,
backed by `GET/DELETE /api/t/:slug/admin/sessions`. The pre-Epic-C
endpoints (`security/sessions/revoke-current` etc.) and the
`User.sessionVersion` bump still work as the coarse-grained
backstop.

**C.4 — Audit event streaming.** Every committed audit row is
fired through `streamAuditEvent` into a per-tenant in-memory
buffer (lazy-imported by `appendAuditEntry` so cold-start cost is
zero for tenants without streaming configured). Flush happens on
100 events OR 5 seconds, HMAC-SHA256-signed
(`X-Inflect-Signature: sha256=<hex>`), POSTed to
`TenantSecuritySettings.auditWebhookUrl`. The HMAC secret is on
the same row, encrypted at rest via the Epic B field-encryption
manifest. Fail-safe — the audit row is already committed, so a
broken SIEM never undoes the write. Privacy-aware payload — free-
text `details` is dropped, only structured `detailsJson` ships;
actor is opaque `userId` + `actorType`, never email.

**C.5 — Server-side rich-text sanitisation.** Use
`sanitizeRichTextHtml` / `sanitizePlainText` /
`sanitizePolicyContent` from `@/lib/security/sanitize` BEFORE
persisting any user-supplied rich-text. Already wired into
`policy.createPolicy`, `policy.createPolicyVersion`,
`task.addTaskComment`, `issue.addIssueComment`. New write paths
that accept HTML or comment text MUST sanitise at the usecase
layer (not just at render time) — render-time sanitisation alone
would leave the row dangerous to PDF export, audit-pack share
links, and future SDK consumers reading the row verbatim. The
allowlist (tags, attributes, link schemes) is in
`src/lib/security/sanitize.ts`; do not widen it without a security
review.

**See `docs/epic-c-security.md`** for the unified operator
runbook (env vars, verification commands, rollback procedures,
failure modes) and `SECURITY.md` for the responsible-disclosure
policy.

### Isolation & Sanitisation Completeness (Epic D)

Epic D closed three concrete gaps left after Epic C. Each is now
guarded by a CI ratchet so the regression surface is small.

**D.1 — `UserSession` RLS.** The Epic C.3 `UserSession` table
shipped without RLS policies. It now carries a single asymmetric
`tenant_isolation` policy (`USING (tenantId IS NULL OR own) WITH
CHECK (own)`) plus the canonical `superuser_bypass`, with `FORCE
ROW LEVEL SECURITY` enabled. The single-policy form is mandatory
because `tenantId` is nullable: a split `tenant_isolation_insert`
policy would be a permissive sibling that lets `app_user` UPDATE a
NULL row to any tenantId. `UserSession` is listed in
`SINGLE_POLICY_EXCEPTIONS` in `tests/guardrails/rls-coverage.test.ts`,
where the post-loop sanity check verifies the asymmetric `qual` +
`with_check` shape is real — a future "simplify" PR that strips
either clause fails CI. See migration
`prisma/migrations/20260423150000_epic_d1_user_session_rls/` and
`tests/integration/user-session-rls.test.ts` for the seven
behavioural assertions (own-INSERT accepts; foreign-INSERT rejects;
NULL-INSERT-under-app_user rejects; NULL-row-claim-to-other-tenant
rejects; etc.).

**D.2 — Encrypted-field write paths sanitised.** Five usecase
files (`finding`, `risk`, `vendor`, `audit`, `control-test`) wrote
to encrypted free-text columns without server-side sanitisation.
Encryption protects confidentiality at rest; sanitisation protects
every downstream renderer (UI, PDF export, audit-pack share link,
SDK consumer reading the row verbatim) that decrypts and reads the
field. All five now route user-supplied free text through
`sanitizePlainText` (or, for surfaces that share the call shape,
the per-file `sanitizeOptional` helper that preserves the
undefined/null/string three-state contract). The
`tests/guardrails/sanitize-rich-text-coverage.test.ts` ratchet has
`SANITISER_COVERAGE_FLOOR = 8`; a future PR cannot silently drop
one of the eight known sanitised usecases without bumping the
floor in the same diff. The companion
`tests/unit/security/sanitize-write-paths.test.ts` carries 20
write-path assertions — one positive XSS-strip per call site.

**D.3 — Legacy `requireAdminCtx` migrated to `requirePermission`.**
Seven tenant API routes (billing × 3, security/sessions × 2,
security/mfa/policy PUT, sso) used the legacy role-tier guard,
which threw a 403 but **did not write an `AUTHZ_DENIED` audit
row** and was invisible to the Epic C.1 permission guardrail. All
seven now use `requirePermission(...)` — denials audit cleanly,
and `tests/guardrails/api-permission-coverage.test.ts` now treats
`billing/`, `sso/`, and `security/` as privileged roots with five
self-service routes (own MFA enrolment, own session revocation)
explicitly listed in `EXCLUDED_ROUTES` with written reasons. The
canonical pattern for new admin routes is now
`requirePermission('<key>', handler)`; `requireAdminCtx` is
explicitly marked legacy/fallback in its own docstring.

**See `docs/epic-d-completeness.md`** for the Epic D operator
runbook (verification commands, rollback procedures, the five
self-service security carve-outs, the asymmetric-RLS rationale).

### RBAC & Permissions

- `src/lib/permissions.ts` — `PermissionSet` (granular UI flags) resolved from the user's role
- Built-in roles: `OWNER`, `ADMIN`, `EDITOR`, `VIEWER`, `AUDITOR` (Prisma enum `Role`)
- Custom roles: `TenantCustomRole` model with `permissionsJson` overrides, referenced via `TenantMembership.customRoleId`
- `appPermissions` on `RequestContext` is already custom-role–aware

### Observability

All structured logging, tracing, and metrics flow through `src/lib/observability/index.ts` (barrel export). Use `log(ctx, level, message, fields)` or `logger.info(...)` for logging. Use `traceUsecase()` / `traceOperation()` for OpenTelemetry spans. Never `console.log` in application code.

### Auth

NextAuth 5 (beta) is configured in `src/auth.ts`. Providers: Google OAuth, Microsoft Entra ID, SAML (via `src/app/api/auth/sso/`), and Credentials. The JWT carries `tenantId`, `role`, and MFA state. Token refresh logic lives in `src/lib/auth/refresh.ts`.

### Environment Validation

`src/env.ts` uses `@t3-oss/env-nextjs` for type-safe env vars. Tests set `SKIP_ENV_VALIDATION=1` to bypass this. Never add raw `process.env` access — add the var to `env.ts` first.

### Background Jobs (BullMQ)

Job definitions are in `src/app-layer/jobs/`. The executor registry is `src/app-layer/jobs/executor-registry.ts`. Jobs run inside `traceUsecase` spans and inherit request context.

## Testing Conventions

- **Unit tests**: Mock dependencies with `jest.mock()` declared **before** imports. Use `buildRequestContext()` helper from `tests/helpers/make-context.ts` to construct test contexts.
- **Integration tests**: Use `prismaTestClient()` and `resetDatabase()` from `tests/helpers/db.ts`. Hit a real DB — do not mock Prisma in integration tests.
- **Guard tests** (`tests/guards/`): Static analysis tests that enforce architectural rules (no `as any`, no unsafe patterns). These are regular Jest tests that scan source files with regex.
- **E2E tests**: Playwright in serial mode. Tests share state (tenantSlug, resource IDs) within a describe block. Use existing HTML `id` attributes — do not add `data-testid` attributes.
- `SKIP_ENV_VALIDATION=1` is set in `jest.setup.js` to prevent env loader crash in unit tests.
- Coverage thresholds: 60% global (branches, functions, lines, statements); checked on `npm run test:coverage`.

## Key Conventions

- **Zod schemas** for all API input validation live in `src/app-layer/schemas/` (backend) and `src/lib/schemas/` (shared).
- **Audit trail**: Call `logEvent()` from `src/app-layer/events/audit.ts` after mutating state. Entries are hash-chained — never write directly to the `AuditLog` table.
- **Error classes**: Use typed errors from `src/lib/errors/` rather than throwing raw `Error`.
- **i18n**: UI strings go through `next-intl`. Message files are in `messages/`. Server components use `getTranslations()`, client components use `useTranslations()`.
- **Path alias**: `@/` maps to `src/`. Always use this alias — never relative paths crossing layer boundaries.
- **Two `DATABASE_URL` vars**: `DATABASE_URL` points to PgBouncer (transaction-mode, used at runtime). `DIRECT_DATABASE_URL` points directly to Postgres (used for Prisma migrations).

## Implementation notes

Every substantive prompt — architectural decisions, new features, security
or infrastructure changes, anything worth revisiting in six months — lands
a short markdown file in `docs/implementation-notes/<YYYY-MM-DD>-<slug>.md`
alongside the code + tests. Commit messages carry the `what + why`; these
notes carry the `design + decisions + tradeoffs` in a grep-friendly form.

**Default structure** (skip any section that doesn't apply):

```markdown
# YYYY-MM-DD — <feature name>

**Commit:** `<sha> <commit subject>`

## Design
<architectural shape — diagrams or prose, 10-30 lines>

## Files
<table of files changed with one-line role per file>

## Decisions
<bullet list of non-obvious tradeoffs and why they went the way they did>
```

**Do NOT include a "Tests added" section** — the test files themselves
are the durable record. Duplicating counts into docs creates rot when the
test list moves.

**Skip** for small UI tweaks, config bumps, bug fixes that don't shift
architecture. The bar is "would a future engineer need the context?"

Existing examples: `docs/implementation-notes/2026-04-22-*.md`.

## UI Platform — Epics 51–60

The following epics established shared primitives, guardrail tests, and
contributor guides. **Always use the platform primitives** — never
hand-roll a replacement. Each section points to its decision-tree doc.

### Epic 51 — Design Tokens & Theme System

Use semantic token classes (`bg-bg-default`, `text-content-muted`,
`border-border-subtle`) instead of raw Tailwind color scales
(`bg-slate-800`, `text-slate-400`). Use `<Button>`, `<StatusBadge>`,
and `<EmptyState>` components instead of legacy `.btn` / `.badge` CSS
classes. See `docs/token-cheatsheet.md` and `docs/ui-buttons.md`.

### Epic 52 — DataTable Platform

Every list page must use `<DataTable>` from `@/components/ui/table`.
Never add raw `<table>` elements in app pages. Use the
`useListPagination` adapter for cursor-based APIs. See
`tests/guards/epic52-datatable-ratchet.test.ts`.

### Epic 53 — Enterprise Filter System

Use `FilterToolbar` + `FilterProvider` + `useFilterContext` from
`@/components/ui/filter/` for list-page filtering. Never build ad-hoc
`useState` + manual URL sync. See
`src/components/ui/filter/GUIDE.md` and `docs/filters.md`.

### Epic 54 — Modal & Sheet Strategy

Use `<Modal>` for quick create/edit/confirm flows and `<Sheet>` for
inspect-and-edit without losing list context. Never hand-roll a
`fixed inset-0 bg-black/…` overlay. See `docs/modal-sheet-strategy.md`.

### Epic 55 — Combobox & Form Primitives

Use `<Combobox>` for selection lists, `<UserCombobox>` for people
pickers, `<RadioGroup>` for 2–5 visible choices, and wrap every
field with `<FormField>`. Never use raw `<select>` or
`<input className="input">` in app pages. See
`docs/combobox-form-strategy.md`.

### Epic 56 — Tooltip & Copy Primitives

Use `<Tooltip>` for hover/focus hints, `<InfoTooltip>` for help icons,
`<CopyButton>` / `<CopyText>` / `useCopyToClipboard` for clipboard.
Never use raw `navigator.clipboard` or add new `title=` attributes.
See `docs/tooltip-and-copy-strategy.md`.

### Epic 57 — Keyboard Shortcuts & Command Palette

Register shortcuts via `useKeyboardShortcut` — never
`document.addEventListener('keydown', …)`. Always supply a
`description`. See `docs/keyboard-shortcuts.md`.

### Epic 58 — Date Pickers

Use `<DatePicker>` for single dates and `<DateRangePicker>` for
ranges. Use `formatDate` / `formatDateTime` from `@/lib/format-date`
for display. Never use `<input type="date">` or raw
`toLocaleDateString`. See `docs/date-picker.md`.

### Epic 59 — Dashboard Charts

When adding or modifying charts/visuals on any dashboard page,
always use the shared chart platform. See `docs/charts.md` for the
decision tree. Never use raw `<svg>`, `<polyline>`, or inline
`style={{ width: \`\${pct}%\` }}` progress bars.

### Epic 60 — Shared Hooks & Polish Primitives

Import shared hooks from `@/components/ui/hooks` (barrel): `useLocalStorage`,
`useOptimisticUpdate`, `useEnterSubmit`, `useInputFocused`, `useScroll`,
`useScrollProgress`, `useInViewport`, etc. Use the polish primitives
`<Accordion>`, `<TabSelect>`, `<ToggleGroup>`, `<Slider>`,
`<NumberStepper>` for dense interaction areas. Never hand-roll a tab
bar, segmented filter row, `localStorage` cache, Enter-submit handler,
or `<input type="number">` stepper — reach for the shared primitive. See
`docs/epic-60-shared-hooks-and-polish.md` and the ratchet
`tests/guards/epic60-ratchet.test.ts`.

### Epic 60 — Automation Events & Dispatch (backend)

The event-driven backbone the rule-builder epic will stand on.
Import everything from `@/app-layer/automation` (single barrel).
Emit via `emitAutomationEvent(ctx, input)` — never construct
`AutomationExecution` rows directly from a usecase. When adding a
new event: add to `events.ts`, add the typed variant to
`event-contracts.ts`, emit from the usecase (or audit emitter), and
write a wiring test. Action handlers, rule-builder UI, and filter
DSL evolution all plug into clearly-marked seams — don't bypass
them. See `docs/automation-events.md` for the full contributor
guide and the decision-tree for extensions.
