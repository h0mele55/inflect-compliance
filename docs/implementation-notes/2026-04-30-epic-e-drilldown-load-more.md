# 2026-04-30 — Epic E.2: Portfolio drill-down — Load-more accumulator

**Commit:** `<pending> feat(ui): epic E.2 — client-side load-more for portfolio drill-down tables`

## Design

The portfolio drill-down API has carried a cursor + limit + nextCursor
contract since Epic O-3. The dashboard preview uses the
`getNonPerformingControls` / `getCriticalRisksAcrossOrg` /
`getOverdueEvidenceAcrossOrg` usecases (hard-capped at 50) and the
dedicated drill-down pages use the `list*` counterparts that take a
cursor and return `{ rows, nextCursor }`.

**The bug Epic E.2 closed:** the dedicated drill-down UI consumed the
paginated contract by treating "Load more" as a `<Link href="?cursor=…">`
that **navigated to a fresh page**. Each navigation re-rendered the
server with one cursor → the user always saw a single window of 50
rows. The contract said "browse beyond 50"; the UI delivered "browse
windows of 50, one at a time, losing prior rows on each click."

The fix is purely UI-side. The server-rendered first page is
unchanged. The client island now:

  - holds the accumulated rows in `useState`
  - renders a `<button onClick={loadMore}>` (not a `<Link>`)
  - on click: `fetch('/api/org/<slug>/portfolio?view=<view>&cursor=<encoded>', { credentials: 'same-origin' })`
  - appends the response's `rows` to local state and replaces
    `nextCursor` with the response's `nextCursor`
  - hides the button when `nextCursor` is null
  - inlines a stable error affordance on non-2xx (no toast, no console)

The shared logic lives in `useCursorPagination` from
`@/components/ui/hooks` so all three tables (and any future
cursor-paginated list page) consume the same primitive.

## Pagination contract

Wire-level contract (unchanged — already in production):

```
GET /api/org/{orgSlug}/portfolio?view={controls|risks|evidence}&cursor=<opaque>&limit=<int>

200 → {
  "rows":       [<row>...],
  "nextCursor": <string>|null
}
```

Per-entity sort + cursor (locked at the usecase layer, asserted by
`tests/integration/portfolio-drilldown-pagination.test.ts`):

| View       | Sort key                                  | Cursor fields              |
| ---------- | ----------------------------------------- | -------------------------- |
| `controls` | status priority DESC, updatedAt DESC, id  | `{ p, d, i }`              |
| `risks`    | inherentScore DESC, updatedAt DESC, id    | `{ s, d, i }`              |
| `evidence` | nextReviewDate ASC, id                    | `{ d (full ISO), i }`      |

Cursor is opaque base64-JSON (treat as a black box on the client).
Invalid cursor lands on page 1 (lenient on read; matches the route's
`parsePagination` contract).

Defaults / clamps:

  - `limit` default = 50, clamped to `[1, 200]`.
  - Per-tenant fetch limit = `max(25, limit*2) + 1` (covers the merge
    + detects the next-page boundary).

## Files

| File | Role |
| ---- | ---- |
| `src/components/ui/hooks/use-cursor-pagination.ts` | NEW — shared hook. State (`rows`, `nextCursor`, `loading`, `error`) + `loadMore()`. Bounded error codes: `load_failed_<status>` or `load_failed`. |
| `src/components/ui/hooks/index.ts` | Barrel export added (verified by `tests/guards/ui-hooks-barrel.test.ts`). |
| `src/app/org/[orgSlug]/(app)/controls/ControlsTable.tsx` | Refactored. `<Link>` → `<button onClick={loadMore}>`. Local state via `useCursorPagination`. Header copy now reflects `pagination.rows.length` + "(more available)" hint. Inline `org-controls-load-error` affordance on failure. |
| `src/app/org/[orgSlug]/(app)/risks/RisksTable.tsx` | Same shape as controls. |
| `src/app/org/[orgSlug]/(app)/evidence/EvidenceTable.tsx` | Same shape as controls. |
| `tests/rendered/use-cursor-pagination.test.tsx` | NEW — 8 hook tests. |
| `tests/rendered/org-drilldown-load-more.test.tsx` | NEW — 6 behavioural tests on the real tables (jsdom + fetch stub). |
| `docs/implementation-notes/2026-04-30-epic-e-drilldown-load-more.md` | NEW — this note. |

## Tests

### NEW

**`tests/rendered/use-cursor-pagination.test.tsx`** (8 tests):

  - renders initialRows + reports hasMore from initialNextCursor
  - hasMore=false when initialNextCursor is null
  - loadMore appends next page + advances cursor + URL the consumer specifies
  - walks 3 pages × 50 rows = 150 (proves > 50 row capability)
  - no fetch fired when no cursor
  - non-2xx → `load_failed_500` + rows preserved
  - thrown fetch → `load_failed` + rows preserved
  - successful loadMore clears prior error

**`tests/rendered/org-drilldown-load-more.test.tsx`** (6 tests):

  - controls: appends a second page + canonical URL + tenant attribution survives merge + button disappears
  - controls: button hidden when nextCursor null on initial render
  - controls: non-2xx → inline `org-controls-load-error` text rendered
  - risks: appends a second page (same pattern)
  - evidence: appends a second page (same pattern)
  - regression: walks 3 × 50 rows via Load more, asserts every controlId from every page is in the DOM after the third click

### EXISTING (continue to pass)

  - `tests/unit/portfolio-routes.test.ts` — 19 tests; `view=controls|risks|evidence` route dispatch, cursor/limit forwarding, RBAC (canDrillDown), invalid limit lenient on read.
  - `tests/integration/portfolio-drilldown-pagination.test.ts` — 4 DB-backed tests; pages through 16 rows × 3 entities preserving sort + tenant attribution + invalid cursor → page 1.
  - `tests/unit/portfolio-pagination.test.ts` — usecase-level cursor walk + tiebreaker behaviour.
  - `tests/unit/org-list-pages-structural.test.ts` — 36 structural assertions; data-testids preserved by the refactor.
  - `tests/unit/org-page-serialization-boundary.test.ts` — `toPlainJson` boundary on every server page.

## Decisions

  - **Why client-side accumulation, not server-paged URLs.** The original
    `<Link href="?cursor=NEXT">` pattern matched a deep-linkable
    "page=2" mental model, but it made no sense for a portfolio
    drill-down: the user wants to **see all critical risks**, not
    flip through windows. Browser back/forward shouldn't hop between
    cursor pages either — that's not a navigable history.
    Client-side accumulation is the canonical "Load more" pattern.
    Re-entering the URL fresh always shows page 1, which is what
    every other "Load more" surface on the web does.

  - **Why a hook instead of inline state.** Three identical consumers
    (controls / risks / evidence) with identical state shapes —
    factor exactly when the third consumer lands. The hook keeps the
    sort + render code in the table component while pulling out the
    fetch/accumulator concern. Future paginated lists (vendors,
    audits) drop in by passing their own `fetchUrl`.

  - **Why preserve the server-side `?cursor=` parsing.** The page
    server component still reads `searchParams.cursor` and forwards
    it to `listNonPerformingControls`. Removing it would break any
    existing bookmark / shared link to `?cursor=ABC`, which would now
    404 the server load. Keeping it as the seed for the accumulator
    (the user lands on page-N as the initial state, then "Load more"
    continues from there) is harmless and preserves a defensible
    deep-link behaviour even though no NEW deep-link is generated.

  - **Why `<button>` not `<Link>` for "Load more".** A `<Link>` triggers
    Next router navigation → server re-render → loses client state.
    A `<button>` keeps the state and fires the API call directly.
    The data-testid (`org-controls-load-more`) is preserved for E2E
    targeting; the structural ratchet only checks for the testid
    string, not the element type.

  - **Why bounded error strings.** `load_failed_500` / `load_failed`
    are stable, machine-readable, and safe to render directly.
    The hook does NOT toast (the consumer renders an inline retry
    affordance) and does NOT log to console (every page has its own
    structured logging on the API side; client-side console noise
    isn't useful for a recoverable user action).

  - **Why no client-side cursor in the URL.** Pushing `?cursor=N` to
    the URL on each click would let users bookmark page-N, but it
    would also (a) make the URL ugly and (b) not actually deep-link
    correctly because the cursor is opaque and may rotate (e.g. the
    cursor encodes a timestamp, and a mid-window mutation can shift
    rows). Letting the URL stay clean keeps the entry-point behaviour
    deterministic.

  - **Why hide the Load-more button on null cursor (instead of
    disabling).** A disabled button leaves visual clutter the user
    can't act on. Hiding it is unambiguous: there's nothing more to
    load. The header text already pluralises and the
    `pagination.rows.length` count tells the user how many rows
    they're looking at.
