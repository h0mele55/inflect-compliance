# 2026-05-06 — interim list-page pagination strategy

**Commits:** PR #149 / #150 / #151 / #152 / #153 / #154 / #155 / #156

This is the architecture decision record for the eight-PR interim
package that landed on the seven heaviest list pages — Controls,
Risks, Evidence, Audits, Policies, Vendors, Findings — between
2026-05-05 and 2026-05-06. It captures the design (why an SSR cap +
SWR-backfill instead of cursor pagination), the package boundary
(why split into eight discrete PRs), and the non-goals that bound
this work.

## Design

The user-visible contract on every list page is "I open the page,
the table appears instantly, every row I have shows up." Three
honest realities make this hard at scale:

  1. **SSR cost is linear in row count.** Server-rendered HTML for a
     5,000-row table is ~5 MB on the wire. The Postgres query that
     produces it is bounded by the per-row `findMany` shape, which
     PR-3 trimmed but didn't eliminate.

  2. **Hydration cost is also linear.** Even after SSR, React Query /
     SWR re-fetches the same list on mount to populate the client
     cache. Without bounds, that's a second copy of the same payload.

  3. **The user almost never wants 5,000 rows.** They want either
     (a) the first ~50–100 rows, scrolled to find the recent items,
     or (b) a filtered subset (status, owner, search) that returns a
     few dozen rows.

The interim package addresses (1)–(3) without committing to a full
cursor-pagination epic, because the row counts on the largest pilot
tenants today are ~hundreds, not tens of thousands. The decision
tree:

  * SSR caps at **100 rows**. Page renders fast; user sees the first
    page worth of data immediately.
  * SWR (or React Query) immediately backfills via the API GET path
    with `keepPreviousData` so the table doesn't flicker.
  * The unbounded backfill itself is capped at **5,000 rows**. If
    the cap fires, a `<TruncationBanner>` tells the user "showing
    the first 5,000 — refine your filters" instead of silently
    showing a partial list.
  * OTel emits `list.page.row_count` (histogram) and
    `list.page.truncation` (counter) on every backfill so the
    operator dashboard knows when a tenant trends past the cap and
    the call needs to be revisited.

```text
                    SSR (100 rows, take=100)
                            │
                            ▼
                     ┌────────────┐
                     │  HTML page │
                     └────┬───────┘
                          │ hydrate
                          ▼
                  SWR / RQ backfill GET
                  (take=5001 sentinel,
                   wrapped { rows, truncated })
                          │
                          ▼
                    ┌──────────────┐
                    │  rendered    │
                    │  list (≤5000)│
                    │  + banner if │
                    │  truncated   │
                    └──────────────┘
                          │
                          ▼
                  recordListPageRowCount → OTel
```

## Why not cursor pagination?

The full-fat alternative — proper cursor pagination on every list
page, with an explicit "load more" or virtual-scroll trigger — is
the right end state. We didn't ship it here because:

  * Today's largest pilot tenant has ~600 rows on the heaviest list
    (Evidence). The 100/5,000 thresholds are well above any actual
    tenant's row count for the next 6–12 months.
  * Cursor pagination requires a coordinated change across SSR (page
    renders the first page only), SWR (paginated read with cursor),
    DataTable (visible-page tracking + "load more" affordance), and
    the API layer (cursor token round-trip). It's an L-T-month epic.
  * The interim package's eight PRs took two days. They fully solve
    the next 6–12 months of growth and surface the dashboard signal
    that tells operations when to graduate to cursor pagination.

The package is forward-compatible: when cursor pagination lands, the
SSR cap becomes "fetch the first page" and the SWR backfill becomes
"fetch subsequent pages on demand". Nothing else changes shape.

## The eight PRs

Each PR scoped to one concern, merged in sequence. Sequencing matters
because each subsequent PR depends on the previous one's wiring being
in place.

| PR  | Scope                                                                       | PR # | Files |
|-----|-----------------------------------------------------------------------------|------|-------|
| 1   | SSR cap fan-out: Controls / Risks / Evidence (`take` plumbing + `SSR_PAGE_LIMIT`) | #149 | 10 |
| 2   | SSR cap fan-out: Audits / Policies / Vendors / Findings                     | #150 | 12 |
| 3   | SELECT-shape trim: hoisted `*ListSelect` constants on all 7 repos           | #152 | 8  |
| 4   | Index audit: composite indexes for `(tenantId, createdAt)` × 2 + `(tenantId, updatedAt)` × 1 | #153 | 3  |
| 5   | Backfill cap + truncation banner: `applyBackfillCap`, `<TruncationBanner>`, all 7 routes + clients | #154 | 25 |
| 6   | Row-count observability: OTel histogram + counter, span attributes for tenant pivot | #155 | 9  |
| 7   | Anti-bloat ratchet: structural test pinning all four invariants per entity  | #156 | 1  |
| 8   | This ADR doc                                                                | _    | 1  |

PR #151 also landed mid-package as a corrective for unrelated
Prisma 7 regressions surfaced when PR-2's changes unblocked a Jest
`db-helper` probe. That side-quest is documented in
`docs/implementation-notes/2026-05-05-pr151-db-helper-and-encryption-wiring.md`
(or wherever it lands as part of that PR's notes).

## Files (canonical layout, post-package)

| Concern                                                       | File                                                                |
|---------------------------------------------------------------|---------------------------------------------------------------------|
| Backfill cap constant + helper                                | `src/lib/list-backfill-cap.ts`                                      |
| Row-count metrics emitter                                     | `src/lib/observability/list-page-metrics.ts`                        |
| Truncation banner                                             | `src/components/ui/TruncationBanner.tsx`                            |
| Per-entity SELECT-shape constant                              | `src/app-layer/repositories/{Audit,Control,Evidence,Finding,Policy,Risk,Vendor}Repository.ts` |
| API GET handler (cap + emit)                                  | `src/app/api/t/[tenantSlug]/{audits,controls,evidence,findings,policies,risks,vendors}/route.ts` |
| Server page (SSR cap)                                         | `src/app/t/[tenantSlug]/(app)/{audits,controls,evidence,findings,policies,risks,vendors}/page.tsx` |
| Client (consume `{ rows, truncated }` + render banner)        | `src/app/t/[tenantSlug]/(app)/{audits,controls,evidence,findings,policies,risks,vendors}/*Client.tsx` |
| Anti-bloat ratchet                                            | `tests/guards/list-page-perf-ratchet.test.ts`                       |
| Per-helper unit tests                                         | `tests/unit/list-page-metrics.test.ts`                              |
| Index migration                                               | `prisma/migrations/20260506020000_pr4_list_page_index_audit/migration.sql` |

## Decisions

### Cap values

* **`SSR_PAGE_LIMIT = 100`** — calibrated for first-paint perception
  speed. The DataTable virtualizes after 1,000 rows (Epic 68), so 100
  is comfortably below the virtualization threshold and renders as a
  flat DOM tree. Smaller values (50, 25) tested fine but felt
  "stingy" on tenants with 80–95 rows where the user expected a
  single page.
* **`LIST_BACKFILL_CAP = 5000`** — well above any reasonable list-
  view use case, well below the payload size that would crash a
  phone browser. The DataTable's virtualization makes the rendering
  side a non-issue at this scale; the pain point is JSON parse time
  on the client, which 5,000 rows handles cleanly.

These values are tunable without baseline-bumping the ratchet —
PR-7 deliberately pins the WIRING SHAPE (the constants exist in the
right place, the call sites use them) but not the numbers.

### Cardinality discipline on metrics

`tenant_id` is a span attribute, not a metric label. With ~100s of
tenants × 7 entities × 2 truncation states, including tenantId
would explode metric storage. The dashboard answers "is the
distribution shifting?" using the histogram; trace search answers
"which tenants are responsible". Same pattern already established
by `repo.method.duration`.

### Wrapped response shape vs. opt-in `?meta=1`

Two designs were considered for surfacing the truncation flag:

  (a) Wrap the API list response unconditionally as
      `{ rows, truncated }`. Breaking shape change; every consumer
      updates.
  (b) Opt-in via `?meta=1` query param; raw array stays the default.
      Backward-compatible; complexity in the route handler.

Chose (a). The seven affected endpoints aren't part of any public
contract (no OpenAPI consumer reads them as raw arrays), the SWR-
side and raw-fetch-side clients all live in this repo, and the
ratchet (PR-7) makes the consumption pattern visible. Option (b)
would have introduced a permanent split in the contract that all
future consumers would have to remember.

### Optimistic-update closures vs. simple invalidate

The 7 list pages mix two write patterns:

  * SWR + `useTenantMutation` (Risks, Evidence, Policies, Vendors).
  * React Query + `useMutation` with `setQueryData` (Controls,
    Audits, Findings).

The shape change in PR-5 broke both — every closure that walked the
cache as `Foo[]` blew up against `CappedList<Foo>`. Three corrective
commits on PR-5 chased these down across the four mutation kinds:

  * `optimisticUpdate(current, vars) => current.map(...)` →
    `optimisticUpdate(current, vars) => ({ rows: current.rows.map(...), truncated: current.truncated })`
  * `setQueryData(key, prev.map(...))` →
    `setQueryData(key, { ...prev, rows: prev.rows.map(...) })`

The lesson, codified in PR-7's ratchet, is that the wiring shape is
load-bearing: you can't trim the SSR fetch without also fixing every
mutation closure that reads from the same cache. Treating them
together as one package was the right call.

## Non-goals

* **No cursor pagination.** Deferred until row-count signal from
  PR-6 says it's needed.
* **No offline-first.** SWR + RQ caches are session-scoped; nothing
  in this package promises offline support.
* **No per-tenant cap tuning.** `LIST_BACKFILL_CAP` is global; if
  a single tenant needs 10,000 rows on one page, they fall back to
  filters. Per-tenant tuning is a feature-gate epic, not a perf
  epic.
* **No Tasks page.** Tasks already shipped its own `take: 100`
  pattern in PR #146 — the eight-PR package mirrored that pattern
  to the other seven. Tasks could be folded into the same shape
  in a follow-up but isn't strictly necessary.
* **No retroactive change to the seven detail-page (`getById`)
  shapes.** PR-3 deliberately left detail pages on their wider
  `include` graphs; the bandwidth/latency math is different there
  (one row, not N).
