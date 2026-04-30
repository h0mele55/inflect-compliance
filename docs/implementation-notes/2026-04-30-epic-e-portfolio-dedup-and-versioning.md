# 2026-04-30 — Epic E.3: Portfolio dedup + API version header

**Commit:** `<pending> feat(api): epic E.3 — getPortfolioData helper + X-API-Version header`

## Design

Two governance improvements that close Epic E:

### 1. `getPortfolioData(orgId, options)` — request-scoped memoised upstream

Every portfolio usecase needs one or both of:

  - `PortfolioRepository.getOrgTenantIds(orgId)`
  - `PortfolioRepository.getLatestSnapshots(tenantIds)`

Before E.3 these reads were duplicated across the call graph. The
worst case: the CSV export composes 5 usecases (summary + health +
3 drill-downs) and previously fired **5× tenants + 2× snapshots = 7
DB round-trips** for one HTTP request.

The new helper at `src/app-layer/usecases/portfolio-data.ts`
memoises both reads PER REQUEST via a WeakMap keyed on the
AsyncLocalStorage `RequestContext`:

```
ctx (object identity) → { orgId, tenantsPromise, snapshotsPromise? }
```

Properties:

  - **Promise-keyed**: concurrent callers in the same request share
    the in-flight promise — no double-fire even with `Promise.all`.
  - **Weak**: cache entries auto-GC when the request scope ends.
    No manual teardown.
  - **Cross-org safe**: a different `orgId` in the same scope (rare)
    falls through to a fresh fetch rather than returning stale data.
  - **Out-of-scope safe**: with no active request context (background
    jobs, scripts, tests outside `runWithRequestContext`), the helper
    falls through to direct repo calls — preserving the unmemoised
    behaviour callers used to get.
  - **Snapshots opt-out**: drill-downs that only need the tenant
    list pass `{ includeSnapshots: false }`. Tenants is still
    memoised; snapshots stays unfetched until a snapshot-needing
    caller in the same request promotes the entry.

After E.3 the same CSV export fires **1× tenants + 1× snapshots = 2
DB round-trips** for the portfolio repository — verified by the new
regression test.

### 2. `X-API-Version: 2026-04-29` — explicit contract versioning

A single constant in `src/lib/api-version.ts`:

```ts
export const API_VERSION = '2026-04-29';
export const API_VERSION_HEADER = 'X-API-Version';
```

Set on every response that flows through `withApiErrorHandling` —
all 253 wrapped routes inherit it automatically. Covers four
response shapes:

  1. 2xx success (`NextResponse.json`) — header set inline.
  2. 2xx success (plain `Response`, e.g. CSV body) — clone-and-reattach
     branch in the wrapper carries it through.
  3. 4xx / 5xx error response (wrapper-built `NextResponse.json`) —
     header set inline.
  4. 429 rate-limit short-circuit (wrapper bypasses the inner
     handler) — header set on the rate-limit response.

The 19 exempt routes (k8s probes, redirect-only flows,
anti-enumeration, CSP report sinks, external webhooks, SCIM, NextAuth
catch-all, staging fixture) intentionally don't carry it — those
contracts are not the canonical `ApiErrorResponse` and have their
own consumers.

**How to bump the version:** edit `API_VERSION` in
`src/lib/api-version.ts`. Date-string format is sortable lexically
("newer wins") and self-documents when the breaking change shipped.
The bump is one line; downstream consumers reading the header
detect the change immediately.

**What versioning DOESN'T do today:** the server does not branch on
a request's `X-API-Version`. Content-negotiation (an `Accept-Version:
…` request header that selects between v1 / v2 dispatchers) is a
separate epic. Today we ship a marker; consumers can record it,
log it, and alert on unexpected changes. The mechanism extends
naturally when content-negotiation is wanted: read the request
header, match against a registry, dispatch.

## Files

| File | Role |
| ---- | ---- |
| `src/app-layer/usecases/portfolio-data.ts` | NEW — `getPortfolioData(orgId, options)` + `_peekRequestCache()` + types. |
| `src/app-layer/usecases/portfolio.ts` | Refactored. 7 direct `PortfolioRepository.getOrgTenantIds` call sites + 1 `getLatestSnapshots` call site routed through the helper. Internal `loadPortfolioBaseData` removed. Orchestrator (`getPortfolioOverview`) keeps its direct-repo parallel fetch — it's its own one-shot path used only by the overview page; the cross-usecase dedup target is the CSV export, where it bites. |
| `src/lib/api-version.ts` | NEW — single source of truth: `API_VERSION` + `API_VERSION_HEADER`. |
| `src/lib/errors/api.ts` | Wrapper sets `X-API-Version` on success (NextResponse + plain Response paths), 4xx/5xx error responses, and the 429 rate-limit short-circuit. |
| `tests/unit/portfolio-data-helper.test.ts` | NEW — 12 unit tests for the helper. |
| `tests/unit/portfolio-export-deduplication.test.ts` | NEW — 2 regression tests proving CSV export now fires tenants+snapshots once each. |
| `tests/unit/api-version-header.test.ts` | NEW — 6 tests covering all wrapper response shapes. |
| `docs/implementation-notes/2026-04-30-epic-e-portfolio-dedup-and-versioning.md` | NEW — this note. |

## Tests added

### `portfolio-data-helper.test.ts` (12)

Cache scoping:

  - inside one request scope, repeated calls fire ONCE
  - CSV-export-shaped composition (5 sequential usecases) fires ONCE
  - concurrent callers share the in-flight tenants promise
  - drill-down callers (`includeSnapshots: false`) skip snapshots fetch
  - snapshots-needing caller promotes a snapshots-skipping cache entry
  - different request scopes don't share
  - different orgIds in same scope bypass
  - outside a request scope, every call fires fresh

Diagnostic surface:

  - `_peekRequestCache()` is null outside a scope
  - `_peekRequestCache()` reports orgId + hasSnapshots after a fetch

Result shape:

  - returns tenants + snapshots + populated `snapshotsByTenant` map
  - returns empty arrays + empty map when `includeSnapshots: false`

### `portfolio-export-deduplication.test.ts` (2)

  - **Load-bearing assertion**: drives the real
    `/api/org/[orgSlug]/portfolio/export` route handler inside a real
    request context, mocks `PortfolioRepository`, and asserts
    `getOrgTenantIds` and `getLatestSnapshots` each fire EXACTLY ONCE
    despite the export composing 5 usecases. Body still contains all
    5 sections (proves dedup didn't drop a usecase).
  - drill-down sections still skip when `canDrillDown=false`, and the
    summary+health path still fires the helper once each.

### `api-version-header.test.ts` (6)

  - constant sanity (date-shaped, header name)
  - 2xx `NextResponse.json` carries the header
  - 2xx plain `Response` (CSV body — clone-and-reattach branch)
  - 4xx thrown `AppError`
  - 5xx unknown throw
  - `X-API-Version` co-exists with `x-request-id` (both echoed correctly)

### Existing (continue to pass)

  - `portfolio-routes.test.ts` (19) — view dispatch + RBAC + cursor/limit forwarding
  - `portfolio-overview.test.ts` (8) — orchestrator fires tenants/snapshots/trends each once
  - `portfolio-usecases.test.ts` — projection correctness across summary/health/trends
  - `portfolio-pagination.test.ts` — usecase cursor walk
  - `portfolio-drilldown.test.ts` — non-paginated drill-down semantics
  - `portfolio-fanout-integrity.test.ts` — auditor-fanout drift detection
  - `portfolio-schemas.test.ts` — Zod schema lock
  - `api-error-contract.test.ts` (23) — wrapper round-trip
  - `api-error-wrapper-coverage.test.ts` (7) — Epic E.1 guardrail

## Verification

- `npx jest tests/unit/portfolio-data-helper.test.ts` → 12/12
- `npx jest tests/unit/portfolio-export-deduplication.test.ts` → 2/2
- `npx jest tests/unit/api-version-header.test.ts` → 6/6
- Epic E sweep (14 suites incl. existing portfolio + error contract + guardrail) → **198/198**
- `npm run typecheck` → clean
- `npm run lint` → clean
- Full `npm test` → 8 failing suites / 43 failing tests, **same as baseline** (no new regressions; baseline failures pre-exist in `risk` / `task` / `evidence` usecase mocks and are unrelated)

## Decisions

  - **Why memoise on AsyncLocalStorage instead of passing data through.**
    The original `loadPortfolioBaseData` was an internal helper. Other
    callers (drill-downs, overview page, CSV export) couldn't reuse it
    without touching their signatures. Promoting it to a request-scoped
    helper consolidates the three duplication paths (per-view API,
    org overview page, CSV export) without touching any usecase
    signature or caller. The architectural benefit is "any future
    portfolio caller automatically dedupes if it joins an existing
    request" — no opt-in required.

  - **Why WeakMap keyed on the RequestContext object.** The context is
    already in scope inside every usecase (CLAUDE.md: "Every usecase
    and repository receives a `RequestContext`"). Keying on its
    object identity gives us request scope for free, with auto-GC
    when the request ends. Alternatives — module-level Map (memory
    leak), passing a cache object through every signature
    (intrusive), monkey-patching Prisma (fragile) — all worse.

  - **Why not memoise the orchestrator path.** The org overview page
    is the only orchestrator caller and composes only with itself.
    Its existing direct-repo pattern (`tenants → parallel(snapshots,
    trends)`) is already 3 calls — already optimal. Routing it
    through the helper would split the parallel fetch into two
    awaits without any caller-shared benefit. The orchestrator and
    the helper are complementary: the orchestrator optimises the
    one-page composition, the helper optimises the multi-usecase
    composition (CSV export, future similar paths).

  - **Why `_peekRequestCache` is exported with a leading underscore.**
    The internal cache state is a testing surface — it's not part of
    the public contract for application code. The leading underscore
    + the docstring marks it as a "library private" helper that
    test code reaches into. Adding a runtime registry decorator
    (`@testOnly` or a `vitest`-only export) would be heavier than the
    convention; the existing codebase uses leading-underscore for
    similar internal-but-test-reachable surfaces.

  - **Why the version header lives in the wrapper, not in middleware.**
    The Epic E.1 wrapper already owns the canonical-contract surface
    (253 routes). Adding the header there means it ships AUTOMATICALLY
    to every wrapped route — including new ones that future PRs add.
    Edge middleware would also work but would emit the header on the
    19 exempt routes too (probes, redirects, SCIM with its different
    error contract); keeping it scoped to the canonical contract
    surface is more honest about what the version represents.

  - **Why a date string for the version.** Three reasons: (a) lexical
    sort order matches "newer wins" — consumer code can compare
    versions with `>=`; (b) the string itself names when the
    breaking change shipped, which helps when correlating with
    operator runbooks; (c) developers don't have to guess what
    "v2" means after enough bumps. Semver would also work but
    overrepresents; we don't have a major/minor distinction at the
    contract level today.

  - **Why we don't dispatch on the version yet.** Content-negotiation
    (read `Accept-Version`, dispatch to v1/v2 handlers) is a
    different problem. We need to: (a) accumulate a real backlog of
    breaking changes worth versioning past; (b) build a registry of
    supported versions; (c) build deprecation telemetry. None of
    those are required to ship the marker, and the marker is what
    makes future versioning detectable client-side without server
    code yet.
