# Inflect Compliance — Architecture

## Tenant-Only Architecture

Inflect Compliance uses a **tenant-only** certification boundary. Every organization (tenant) manages ISO 27001 compliance as a single, unified scope.

> **No sub-scopes.** The "Scope" concept was removed. All domain entities (risks, controls, evidence, assets, policies, audits, findings) are scoped to the tenant only.

### URL Structure

| Type | Pattern | Example |
|------|---------|---------|
| **UI pages** | `/t/[tenantSlug]/…` | `/t/acme-corp/risks` |
| **API routes** | `/api/t/[tenantSlug]/…` | `/api/t/acme-corp/controls` |

There are **no** `/s/[scopeSlug]` routes. These were permanently removed.

### Membership Model

```
User ──┐
       ├── TenantMembership (role: ADMIN | EDITOR | READER | AUDITOR)
       │     └── Permissions: canRead, canWrite, canAdmin, canAudit, canExport
Tenant ┘
```

Roles are assigned per tenant via `TenantMembership`. There is no scope-level membership.

### Row-Level Security (RLS)

PostgreSQL RLS enforces tenant isolation at the database level:

```sql
-- Standard tables (required tenantId)
CREATE POLICY tenant_isolation_select ON "<table>" FOR SELECT
  USING ("tenantId" = current_setting('app.tenant_id', true));

-- Control table (nullable tenantId for global ISO controls)
CREATE POLICY tenant_isolation_select_control ON "Control" FOR SELECT
  USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true));
```

Only `app.tenant_id` is used. There is no `app.scope_id`.

## Control Applicability

Controls are **applicable by default**. Instead of filtering controls into scopes, controls can be marked as **Not Applicable** with a mandatory justification — the ISO 27001 Statement of Applicability (SoA) approach.

| Field | Type | Description |
|-------|------|-------------|
| `applicability` | `APPLICABLE` \| `NOT_APPLICABLE` | Default: `APPLICABLE` |
| `applicabilityJustification` | `String?` | Required when N/A |
| `applicabilityDecidedByUserId` | `String?` | Who decided |
| `applicabilityDecidedAt` | `DateTime?` | When decided |

### API

```
PUT /api/t/:tenantSlug/controls/:id/applicability
Body: { applicability: "NOT_APPLICABLE", justification: "Cloud-only org" }
```

### Audit Trail

Every applicability change emits a `CONTROL_APPLICABILITY_CHANGED` audit event with old → new values and justification.

### Reports

The Statement of Applicability (SoA) uses `control.applicability` to determine whether a control is applicable, not `control.status`.

## Guardrails

A CI guardrail test (`tests/unit/scope-guardrails.test.ts`) prevents accidental reintroduction of scope-related code:

- ❌ No file paths containing `/s/[scopeSlug]`
- ❌ No `scopeId`, `resolveScopeContext`, `ScopeMembership`, or `Scope` model references
- ❌ No scope API routes or middleware redirect shims
- ❌ No `scopeRisks` i18n keys

## Tech Stack

- **Framework:** Next.js 16 (App Router) + React 19
- **DB:** PostgreSQL + Prisma 7 (adapter pattern, multi-file schema)
- **Auth:** NextAuth.js (Auth.js)
- **i18n:** next-intl (en, bg)
- **Validation:** Zod 4
- **Testing:** Jest (unit + integration + jsdom-rendered)
- **Client data fetching:** SWR-first via `useTenantSWR` /
  `useTenantMutation` (Epic 69 — see next section).

## Client-Side Data Fetching — SWR-First (Epic 69)

The codebase has one canonical recipe for reading and mutating
tenant-scoped API data from a client component. Three primitives,
one architecture:

| Primitive | Purpose | File |
|-----------|---------|------|
| `useTenantSWR<T>(path, options?)` | Tenant-aware SWR read hook. Auto-prefixes the path with `/api/t/{slug}` from `TenantContext`, returns the standard SWR surface (`data` / `error` / `isLoading` / `mutate`). | `src/lib/hooks/use-tenant-swr.ts` |
| `useTenantMutation<TData, TInput, TResult>(opts)` | Optimistic-update wrapper around SWR's `mutate(key, Promise<T>, opts)`. Handles optimistic apply, rollback on throw, and post-success revalidation in one typed call. | `src/lib/hooks/use-tenant-mutation.ts` |
| `CACHE_KEYS` | Typed registry of every tenant-relative cache key. IDE autocomplete on every resource (`CACHE_KEYS.controls.list()`, `.detail(id)`, `.dashboard()`, …). One source of truth — never hand-write `/api/t/${slug}/...` in a component. | `src/lib/swr-keys.ts` |

### When to use RSC vs SWR

| Use a Server Component when… | Use SWR when… |
|------------------------------|---------------|
| The page has only read-once data per visit (audit reports, static framework references). | The page has frequently-changing data the user reviews repeatedly (dashboards, list pages, detail pages with status flips). |
| You need the response on first paint with zero JS cost. | You need optimistic mutations, background revalidation on focus, or programmatic invalidation across the page tree. |
| The data is sensitive enough that you want it to never enter a client cache. | The data is expected to update from elsewhere in the app (mutation here invalidates list there). |

The **hybrid pattern** (server fetches once + hands the payload to a
`'use client'` shell as `fallbackData`) is the canonical adoption
shape for migrating a fully-RSC page. It keeps first-paint instant
AND gets every SWR benefit. Reference impl: the executive dashboard
(`src/app/t/[tenantSlug]/(app)/dashboard/page.tsx` →
`DashboardClient.tsx`).

### Reading: `useTenantSWR`

```ts
// Tenant-relative path. Hook prepends `/api/t/{slug}` via TenantContext.
const { data, error, isLoading, mutate } =
    useTenantSWR<ControlListItemDTO[]>(CACHE_KEYS.controls.list());

// Conditional fetching — pass `null` to skip.
const { data } = useTenantSWR<RiskDetailDTO>(
    riskId ? CACHE_KEYS.risks.detail(riskId) : null,
);

// Filter-aware key — each filter combo gets its own cache entry.
const key = qs ? `${CACHE_KEYS.evidence.list()}?${qs}` : CACHE_KEYS.evidence.list();
const { data } = useTenantSWR<EvidenceListItem[]>(key, {
    fallbackData: filtersMatchInitial ? initialData : undefined,
});
```

Defaults applied by the hook (each chosen deliberately — see source):

- `revalidateOnFocus`, `revalidateOnReconnect` — fresh on tab return / network blip.
- `keepPreviousData: true` — list pages stay populated through revalidation.
- `dedupingInterval: 5_000` — collapses concurrent same-key reads to one HTTP call.
- `errorRetryCount: 2`, `errorRetryInterval: 2_000` — bounded retry without spam.

### Writing: `useTenantMutation`

```ts
const statusMutation = useTenantMutation<ControlPageDataDTO, { status: string }>({
    key: CACHE_KEYS.controls.pageData(controlId),
    mutationFn: async ({ status }) => {
        const res = await fetch(apiUrl(`/controls/${controlId}/status`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
        if (!res.ok) throw new Error('Status update failed');
        return res.json();
    },
    optimisticUpdate: (current, { status }) =>
        current ? { ...current, control: { ...current.control, status } } : current!,
    invalidate: [CACHE_KEYS.controls.list()],
});

// Trigger — resolves to the API result, re-throws on failure.
await statusMutation.trigger({ status: 'IMPLEMENTED' });
```

Lifecycle:

1. `trigger(input)` → SWR applies `optimisticUpdate(current, input)` synchronously. Every `useTenantSWR(key)` consumer re-renders with the predicted state.
2. `mutationFn(input)` runs. Throwing rolls the cache back via `rollbackOnError: true` (the default).
3. On success, SWR revalidates the key (background GET) — server-authoritative state replaces the optimistic prediction.
4. Sibling keys in `invalidate` get a parallel refetch.

### Optimistic update patterns (the four product shapes)

Each shape is a one-line `optimisticUpdate` closure. The recipe
matrix from Epic 69's pilot migrations:

| Shape | Closure | Reference impl |
|-------|---------|----------------|
| Detail patch | `(current, input) => ({ ...current, ...input })` | `controls/[controlId]/page.tsx::editMutation` |
| Status flip | `(current, { status }) => ({ ...current, status })` | `controls/[controlId]/page.tsx::statusMutation` |
| List append | `(current, item) => [item, ...(current ?? [])]` | `evidence/UploadEvidenceModal.tsx` |
| List remove | `(current, { id }) => (current ?? []).filter(x => x.id !== id)` | `controls/[controlId]/page.tsx::unlinkEvidence` |
| Bulk patch | `(current, { ids, value }) => current.map(x => ids.includes(x.id) ? { ...x, ...value } : x)` | `tasks/TasksClient.tsx::bulkMutation` |

### Cache-key conventions

Defined in `src/lib/swr-keys.ts`. Convention:

- Keys are **tenant-relative** paths starting with `/`. The `/api/t/{slug}` prefix is added by the hooks. Never hand-write the prefix in a component.
- Every resource exposes `list()` and (where the API has a detail route) `detail(id)`. Sub-views are flat methods (`controls.dashboard()`, `audits.readiness()`, `evidence.metrics()`).
- `as const` everywhere — IDE autocomplete shows every resource and method on a single keystroke.
- Filter-aware keys are composed inline at the call site: `${CACHE_KEYS.X.list()}?${qs}`. The registry doesn't try to model query strings.

Adding a new resource: pick `list()` + `detail(id)` via `makeResource('<base>')` and spread it. Add named methods only for sub-views the registry actually serves.

### Migration recipe (step-by-step, from React Query → Epic 69 hooks)

The five completed pilot migrations (dashboard, control detail,
evidence + risks, policies/tasks/vendors) all followed the same
mechanical recipe:

1. **Replace the read.** Swap `useQuery({ queryKey, queryFn, initialData })` for `useTenantSWR<T>(path, { fallbackData })`. Keys become tenant-relative paths, with `?${qs}` suffix for filter-aware variants.
2. **Replace mutations with optimistic shape.** Swap `useMutation({ onMutate, onError, onSettled })` for `useTenantMutation({ key, mutationFn, optimisticUpdate, invalidate })`. The hook's defaults already provide rollback + revalidation; you write the `optimisticUpdate` closure only.
3. **Replace `queryClient.setQueryData / invalidateQueries`.** Use `useSWRConfig().mutate(key, value, { revalidate: false })` for cache writes, and the function-form `swrMutate((key) => key.startsWith(prefix), …)` for invalidating every filter variant of a resource.
4. **Drop dead helpers.** `apiUrl` / `queryClient` / `queryKeys` imports go. Negative-pinned by `tests/unit/list-pages-swr-migration.test.ts` and the surface-specific structural tests under `tests/unit/`.

Migration discipline: never leave a page in dual-cache state (some
React Query reads + some SWR reads). The optimistic update will be
invisible because the read source is on the other cache library.

### Status

Migrated client surfaces (Epic 69, six waves):

- `dashboard/` — hybrid SSR + SWR, both executive payload and trend snapshot.
- `controls/[controlId]/` — page-data read + status mutation + edit mutation + delayed-commit unlinks (Epic 67).
- `evidence/` — list read + review mutation + upload modal (optimistic append) + retention edits.
- `risks/` — list read.
- `policies/` — list read.
- `tasks/` — list read + bulk mutation (multi-row optimistic patch).
- `vendors/` — list read.

Other client surfaces (modals, audits / assets / findings / calendar lists,
TraceabilityPanel, etc.) still use TanStack React Query during
incremental adoption. Each is a follow-up PR using the same recipe.

### Dev tooling: `SWRDevTools`

Floating panel at the bottom-right of the viewport that surfaces
the live state of every Epic 69 cache entry. Lives at
`src/components/dev/swr-devtools.tsx`, mounted once in
`ClientProviders` so every tenant / org page gets it.

Self-gated against `process.env.NODE_ENV !== 'development'` AND
`process.env.NEXT_PUBLIC_TEST_MODE === '1'`. Tree-shaken from the
production bundle and never paints during E2E runs. Surfaces:

- Total cache size + count of in-flight revalidations.
- Per-key state (data / error / validating) + relative timestamp.
- Cumulative hit / miss counters from observed transitions.

Click the bottom-right pill (`SWR · 12`) to expand; click `×` to
collapse.

## Guardrails (Epic 69 wave)

`tests/unit/list-pages-swr-migration.test.ts` is the active
ratchet — it iterates `LIST_PAGES` and fails CI if any of the
migrated surfaces re-imports `@tanstack/react-query`,
`queryKeys`, `useQuery`, `useQueryClient`, or
`.invalidateQueries`. Pair this with the surface-specific
structural tests
(`tests/unit/control-detail-shell-adoption.test.ts`,
`tests/unit/executive-dashboard-page.test.ts`,
`tests/unit/evidence-risks-swr-migration.test.ts`) which pin
each migrated page's exact wiring (hook, key, mutation, sibling
fan-out, `router.refresh()` prohibition).

A future migration that re-introduces React Query on a covered
surface fails CI in the same diff.
