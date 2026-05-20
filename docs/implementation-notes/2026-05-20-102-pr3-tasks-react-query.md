# 2026-05-20 — #102 PR-3 — task detail page data-layer migration (item 5)

**Commit:** `<pending> perf(tasks): #102 item 5 — migrate task detail page to useTenantSWR`

## Problem

`tasks/[taskId]/page.tsx` read the task and each tab (links,
comments, activity) via raw `useState` + `useEffect` + `fetch`, with
four `react-hooks/set-state-in-effect` lint disables. Every mutation
(`changeStatus`, `handleAssign`, `addLink`, `addComment`) re-fetched
the **entire** task with `fetchTask()` — a full round-trip with a
spinner before the UI updated.

## Change

Migrated the page's data layer to **`useTenantSWR`** (Epic 69):

- `task`, `links`, `comments`, `activity` are now `useTenantSWR`
  reads. Tab data fetches lazily — the SWR key is `null` while its
  tab is inactive, so nothing loads until the tab opens (same
  laziness the old tab-gated effects had, without the effects).
- Mutations write the SWR cache through `mutate`:
  `changeStatus` / `handleAssign` apply an **optimistic patch**
  (`mutate(fn, { revalidate: false })`) so the new status / assignee
  shows instantly, then revalidate in `finally` to reconcile
  server-derived fields (`completedAt`, `resolution`) the patch
  can't know. `addLink` / `addComment` / `removeLink` revalidate the
  affected list (and the task, whose `_count` drives the tab badge).
- The assignee picker uses a three-state draft (`undefined` =
  untouched → mirror the task's persisted assignee) — no seeding
  effect.

All four fetch `useEffect`s are gone; the file's own
`TODO(swr-migration)` is resolved and every
`react-hooks/set-state-in-effect` disable is removed.

## Decision — `useTenantSWR`, not React Query

#102 item 5 said "`useQuery` + `useMutation`". The codebase has
since standardised on **`useTenantSWR`** (Epic 69) — the file's own
TODO asked for exactly that, and the sibling control-detail page
uses it. Following the codebase's current data-layer standard over
the three-week-old issue's wording keeps the two detail pages
consistent and avoids introducing a second fetching library.
`useTenantSWR`'s `mutate` delivers the same optimistic-update
ergonomics the issue wanted.

## Files

| File | Change |
|---|---|
| `tasks/[taskId]/page.tsx` | data layer → `useTenantSWR`; optimistic mutations |
| `tests/guards/action-label-vocabulary.test.ts` | baseline line numbers updated (the two pre-existing `+ ` literals shifted) |

## Decisions

- **Optimistic + revalidate, not response-trust.** The status /
  assign endpoints return a task, but not necessarily the *rich*
  `getById` shape (with `assignee`, `control`, `_count`). Trusting
  the response verbatim could thin the cached task. An optimistic
  scalar patch + a revalidate keeps the cache rich and correct.
- **No new test.** Item 5 is a refactor with no behaviour change —
  same data shapes, same render. Typecheck + lint + the controls/
  tasks E2E cover it.
