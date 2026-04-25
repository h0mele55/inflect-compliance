# 2026-04-24 — R-1 closure: multi-tenant user is now first-class

**Commit:** `feat(epic-1): R-1 closure — multi-tenant user is now first-class`

## Design

Previously the jwt callback loaded only `take: 1` (oldest) TenantMembership and
baked a single slug/tenantId/role into the JWT. Users with memberships in two
tenants could only ever reach the older one; the middleware gate rejected the second.

The fix has four reinforcing parts:

1. **JWT carries `memberships: MembershipEntry[]`** — all ACTIVE rows, ordered by
   `createdAt ASC`. The array is set at sign-in time (the only place Prisma is
   available in the auth callback). Backward-compat: `tenantId`, `tenantSlug`,
   `role` still populate from `memberships[0]` so every existing read site keeps
   working without change.

2. **Middleware gate uses `memberships.some(m => m.slug === urlSlug)`** instead of
   the old string equality check. O(memberships) per request, no DB hit; still JWT-
   only. `/tenants` added to `PUBLIC_PATH_PREFIXES` so the picker is reachable
   before an active tenant is selected.

3. **Server-side role resolution unchanged** — `resolveTenantContext` has always
   done a DB lookup by URL slug and returned the role for THAT specific membership.
   No bleed-over was possible before; R-1 didn't change this layer.

4. **`/tenants` picker page** — server component. 0 memberships → `/no-tenant`,
   1 → direct to `/t/<slug>/dashboard`, >1 → renders a list of workspace cards.
   Post-sign-in default `callbackUrl` changed from `/dashboard` to `/tenants`.

## Files

| File | Change |
|---|---|
| `src/auth.ts` | JWT loads all ACTIVE memberships; session exposes array |
| `src/lib/auth/guard.ts` | `checkTenantAccess` takes memberships array; `/tenants` added to public paths |
| `src/middleware.ts` | Passes `session.user.memberships` to `checkTenantAccess` |
| `src/app/tenants/page.tsx` | New: tenant picker server component |
| `src/app/login/page.tsx` | Default callbackUrl changed to `/tenants` |
| `src/app/page.tsx` | Root redirector now goes to `/tenants` |
| `tests/integration/middleware-tenant-gate.test.ts` | Updated to memberships array shape |
| `tests/integration/middleware-multi-tenant-gate.test.ts` | New: multi-tenant gate assertions |
| `tests/integration/multi-tenant-jwt.test.ts` | New: JWT shape + ACTIVE-only filter |
| `tests/integration/tenant-picker-page.test.ts` | New: picker redirect logic |
| `tests/integration/per-tenant-role-resolution.test.ts` | New: security-critical role isolation |
| `tests/unit/tenant-isolation-structural.test.ts` | `tenants` added to ALLOWED_ROOT_PAGES |
| `tests/guardrails/membership-identity.test.ts` | Regex extended to match `m.role` pattern |

## Decisions

- **JWT carries the full array, not "active tenant slug only"** — the picker needs the
  list to render. Storing it in the JWT avoids a DB hit on every page load. The JWT is
  signed+encrypted (A256CBC-HS512 via NextAuth v5); adding the array does not expose
  tenant data to the client beyond what `session.user.memberships` surfaces.

- **`status: 'ACTIVE'` filter in the query** — DEACTIVATED/REMOVED rows must not grant
  middleware access. The existing `resolveTenantContext` already checks status at the
  usecase layer; the JWT filter adds an early rejection before the middleware even tries.

- **Server-side role not JWT-derived** — `resolveTenantContext` always hits the DB for
  the per-request tenant. This is the correct authority: the JWT memberships array is
  for middleware routing only, not role enforcement. A stale JWT cannot carry a stale
  role into a request handler.

- **`/tenants` as public path** — the picker must be reachable when no `tenantId` is in
  the JWT (e.g. newly signed-up user with one pending invite). Adding it to
  `PUBLIC_PATH_PREFIXES` is the correct placement (already carves out `/no-tenant`,
  `/invite/`); the structural guard test is updated to accept it as an intentional
  root-level page.
