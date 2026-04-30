# 2026-04-30 — Epic E.1: API contract completeness

**Commit:** `<pending> feat(api): epic E.1 — error-handler coverage + canonical exemption registry`

## Design

Every API route under `src/app/api/**/route.ts` MUST have a deliberate
error-handling strategy. Two valid strategies exist:

  - **Canonical** — wrap the handler with `withApiErrorHandling` from
    `@/lib/errors/api`. Inherits the standardized `ApiErrorResponse`
    contract (`{ error: { code, message, requestId, details? } }`),
    the `x-request-id` header, observability glue, OTel spans,
    request metrics, Sentry capture for 5xx, and rate-limit
    enforcement on mutations.

  - **Exempt** — listed in `BARE_ROUTE_EXEMPTIONS` with a written
    `reason` and a `category` that buckets the bypass into one of:
    `k8s_probe`, `nextauth_framework`, `redirect_only`,
    `anti_enumeration`, `csp_report_sink`, `external_webhook`,
    `scim_2_0`, `staging_fixture`.

The CI guardrail
(`tests/guardrails/api-error-wrapper-coverage.test.ts`) walks the
route tree and fails if either strategy is violated:

  - bare route not in registry → coverage gap
  - registry entry now wrapped → dead taxonomy
  - registry entry's file deleted → garbage entry
  - registry entry's reason shorter than 40 chars → no-think bypass
  - mutation regression: stripping the wrapper from a known-wrapped
    route MUST trip the detector (proves it isn't vacuously passing)

## Audit

```
Total routes:    272
Wrapped:         253  (was 247)
Exempt:           19
```

The 6 newly-wrapped routes:

| Route | Why it wasn't wrapped before |
| ----- | --------------------------- |
| `auth/ui-config/route.ts` | Trivial flag-reader; no thrown errors. Wrapped for consistency + x-request-id. |
| `docs/route.ts` | Swagger UI HTML; never throws. Wrapped so an unexpected runtime fault yields a clean 5xx instead of a Next.js stack-trace HTML page. |
| `auth/sso/oidc/start/route.ts` | Used bespoke `jsonResponse({error: '...'}, {status})` shapes for 400/404/500/502 paths. Refactored to throw `badRequest`/`notFound`/`configurationError`/`externalServiceError` — bodies now standardized. |
| `auth/sso/saml/start/route.ts` | Same pattern as OIDC start; same refactor. |
| `invites/[token]/start-signin/route.ts` | Sets cookie + 302 to /login. Wrapped to inherit x-request-id; redirect contract unchanged. |
| `org/invite/[token]/start-signin/route.ts` | Same as tenant version. |

The 19 exempt routes group by category:

  - **k8s_probe** (3): `health`, `livez`, `readyz` — probe responses
    carry a structured `CheckResult` shape parsed by k8s / GCP MIG /
    LBs. Every dependency check is internally try/catch-wrapped; the
    routes contractually never throw. Wrapping would replace the probe
    shape with `ApiErrorResponse` on the off chance an unhandled throw
    escaped, breaking probe automation.

  - **nextauth_framework** (1): `auth/[...nextauth]` — NextAuth owns
    its own error rendering, callback URLs, OAuth/credentials routing.
    POST is pre-rate-limited via LOGIN_LIMIT before delegating.

  - **redirect_only** (5): two SSO callbacks, `verify-email`, two
    `accept-redirect` invite-redeemer routes. Every code path returns
    a 302/303; the "error" channel is the query string on the redirect
    target. JSON errors would break the UX.

  - **anti_enumeration** (1): `verify-email/resend` — uniform 200 for
    every input so the response cannot be used to enumerate registered
    emails. Wrapping would convert internal throws into a 500, creating
    a side channel.

  - **csp_report_sink** (2): `csp-report` (legacy) and
    `security/csp-report` — always 204 (or 413/429); browsers fire-and-
    forget; no JSON consumer.

  - **external_webhook** (3): `stripe/webhook`, `storage/av-webhook`,
    `integrations/webhooks/[provider]` — provider-specific signature
    schemes, idempotency models, retry semantics. Return 200 on
    processing failure (after logging) to prevent provider retry storms.
    Wrapping would convert unrelated internal throws into the wrong
    shape from the provider's perspective.

  - **scim_2_0** (3): `scim/v2/ServiceProviderConfig`,
    `scim/v2/Users`, `scim/v2/Users/[id]` — RFC 7644 mandates a SCIM-
    specific error shape (`urn:ietf:params:scim:api:messages:2.0:Error`)
    that enterprise IdPs (Okta, Entra ID, OneLogin) parse. Not
    reconcilable with `ApiErrorResponse`.

  - **staging_fixture** (1): `staging/seed` — dev-/staging-only
    seed endpoint with token gate, bespoke success body shape consumed
    by E2E scripts, production-disabled at the route level.

## Files

| File | Role |
| ---- | ---- |
| `src/lib/errors/route-exemptions.ts` | NEW — `BARE_ROUTE_EXEMPTIONS` registry: single source of truth for legitimately-bare routes with categorized reasons. |
| `src/app/api/auth/ui-config/route.ts` | Wrapped. Pure import + wrap. |
| `src/app/api/docs/route.ts` | Wrapped. Pure import + wrap. |
| `src/app/api/auth/sso/oidc/start/route.ts` | Wrapped. `jsonResponse({error})` calls refactored to AppError throws (`badRequest` / `notFound` / `configurationError` / `externalServiceError`). |
| `src/app/api/auth/sso/saml/start/route.ts` | Wrapped. Same refactor as OIDC start. |
| `src/app/api/invites/[token]/start-signin/route.ts` | Wrapped. Type signature on `params` switches from `Promise` to resolved object (the wrapper handles the await transparently — GAP-05). |
| `src/app/api/org/invite/[token]/start-signin/route.ts` | Wrapped. Same shape. |
| `tests/guardrails/api-error-wrapper-coverage.test.ts` | NEW — 7 tests: coverage check, exemption file-existence check, dead-exemption check, reason-length check, mutation regression, wrapped-import sanity, sanity floor on route discovery. |
| `tests/unit/api-error-contract.test.ts` | NEW — 23 round-trip tests: happy-path, 4xx subclasses (×6), domain errors (×5), Zod, Prisma P2002/P2025, unknown / leaky throws, invariant: every error response carries `x-request-id` + `Cache-Control: no-store`. |
| `tests/unit/openapi-docs-route.test.ts` | UPDATED — pre-existing tests called `GET()` with no args; now constructs a real `NextRequest` since the wrapper reads `req.headers` / `req.nextUrl`. Six existing assertions preserved verbatim. |

## Decisions

  - **Why a registry, not an inline allowlist in the test.** Locating
    the bypass list next to the wrapper itself (`src/lib/errors/`)
    means the *code reviewer* of a new bare route gets a one-line
    diff showing `BARE_ROUTE_EXEMPTIONS` growing — same review surface
    as adding a new role permission. A test-side allowlist is harder
    to find and the categories don't cluster. The registry exports
    its own type (`BareRouteExemption`) so future code can iterate it
    (e.g. an OpenAPI generator that needs to skip the exempt routes).

  - **Why categories.** The eight categories make it obvious *why*
    a bypass is okay. A reviewer who sees "external_webhook" knows
    to verify provider-specific signature semantics; "anti_enumeration"
    flags the uniform-response invariant. A bare `reason: '...'` string
    field would have allowed reviewers to nod along without checking
    the category fits.

  - **Why the SSO start refactor and not the SSO callbacks.** Start
    routes returned `{error: '...'}` JSON on misconfigure / IdP
    unreachable — those bodies were already inconsistent with the
    canonical contract and had no production consumer (a misconfigured
    SSO link only fires on first-time setup). Callbacks redirect to
    `/login?error=<code>` on EVERY failure and the UX depends on it;
    wrapping them would convert failures to JSON 4xx and break the
    error display on /login. The redirect-only semantics is a contract,
    not an oversight.

  - **Why not wrap the staging seed.** The seed body shape
    (`{ success, message, counts, login: { email, password } }`) is
    consumed by `scripts/smoke-staging.mjs` and the E2E bootstrap.
    Changing it to `ApiErrorResponse` requires touching the consumer
    in lockstep, and the endpoint is dev-only — the cost outweighs the
    consistency win. Listed in the registry with a `staging_fixture`
    category so it's visibly an operational fixture, not a forgotten
    bare route.

  - **Why a 40-char floor on `reason`.** Empirically, every real reason
    in the registry runs 80–300 chars. A reviewer who writes
    `"because"` to silence the guardrail trips this floor; the
    constraint forces them to type out the actual rationale.

  - **Why a mutation regression in the guardrail.** A regex-based
    detector that says "every route is wrapped" can be vacuously
    correct if the regex never matches anything (e.g. someone changes
    `WRAPPER_TOKEN` from `withApiErrorHandling` to a non-existent
    string). The mutation proof picks the smallest known-wrapped route
    (`auth/ui-config/route.ts`), strips the token in-memory, and
    asserts the detector now reports it as bare. If the assertion ever
    fails, the detector has rotted and CI fails loud.

  - **Why no Sentry assertion in the round-trip tests.** Sentry is
    initialized in `src/instrumentation.ts` and gated by
    `SENTRY_DSN`; the wrapper's `captureError` is a no-op in tests.
    Asserting "Sentry captured this" would require a mock that
    duplicates what `instrumentation.ts` already enforces. The
    round-trip tests focus on the response contract — the channel
    that matters to clients.
