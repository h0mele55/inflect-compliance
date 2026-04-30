# 2026-04-30 — `EntityDetailLayout` shell extraction (CISO-Assistant inspiration)

**Commit:** `<pending> refactor(ui): extract EntityDetailLayout from controls detail page`

Prompt 1 of 3 in the CISO-Assistant-inspired refactor PR. Extracts a
reusable detail-page shell from the existing controls detail page,
borrowing the **structural** strength of CISO-Assistant's
`DetailView.svelte` (one shell across all entities) without giving up
Inflect's stronger **domain-specific panels** (`TraceabilityPanel`,
`LinkedTasksPanel`, `TestPlansPanel`).

## Reusable detail-layout architecture

```
src/components/layout/
  ├── ListPageShell.tsx        (Epic 52 — list pages)
  ├── EntityDetailLayout.tsx   (NEW — detail pages)
  ├── AppShell.tsx
  ├── OrgAppShell.tsx
  └── …
```

The shell carries layout, not business content. Specifically:

  - **Header** — back link + title + meta row (badges) + right-side
    actions slot.
  - **Tab bar** — tablist-roled buttons with active underline, count
    badges, optional disabled state. Skipped when no tabs are
    supplied (sections-stack pages just render children directly).
  - **Lifecycle states** — loading skeleton, inline error, empty-
    not-found message. Each short-circuits the body so the page
    doesn't render headers around a missing entity.

Pages own:

  - **All data** — queries, mutations, optimistic updates, refetch
    plumbing. The shell is presentational; it doesn't fetch.
  - **All tab content** — every tab body lives in the page (overview
    metadata grid, evidence table, mappings table, the
    domain-specific panels).
  - **All domain decisions** — which badges to show, which actions
    to enable per-permission, what the tab list is, which tab is
    active.

Result: a future risks / policies / vendors / audits detail page can
adopt the shell without inheriting controls' content vocabulary.

## Shared concerns extracted

| Concern | Before | After |
| ------- | ------ | ----- |
| Back link | Inline `<Link>` per page | `back={{ href, label }}` prop |
| Page title | Inline `<h1>` per page | `title` prop |
| Meta row (badges) | Inline flex container per page | `meta` prop |
| Right-side actions | Inline flex container per page | `actions` prop |
| Loading skeleton | ~25 lines hand-rolled per page | `loading` prop renders shared skeleton |
| Error state | `<div className="p-12 text-center text-red-400">` per page | `error` prop with consistent token-error styling + `role="alert"` |
| Empty state | `<div className="p-12 text-center text-content-subtle">` per page | `empty={{ message }}` prop |
| Tab bar | ~12 lines of `tabs.map(t => <button>)` per page | `tabs / activeTab / onTabChange` props |
| Tab panel a11y | Hand-rolled or skipped | Shell emits `role="tabpanel" aria-labelledby="tab-${active}"` |

## Controls page refactor summary

The page is **structurally simpler** without losing any feature:

  - Replaced ~75 lines of inline header JSX with a `headerMeta` and
    `headerActions` extraction + `<EntityDetailLayout>` wrapper.
  - Replaced the inline tab bar (~12 lines) with the shell's
    `tabs / activeTab / onTabChange` contract.
  - Replaced the inline loading skeleton (~25 lines) with
    `<EntityDetailLayout loading />`.
  - Replaced the inline error / empty divs with
    `<EntityDetailLayout error={…} />` and
    `<EntityDetailLayout empty={…} />`.
  - **Kept verbatim**: every tab's content (overview metadata grid,
    automation section, sync-now flow, applicability inline panel,
    tasks table + creation form, evidence table + upload + link,
    mappings table + framework picker, activity feed, edit modal,
    success toast) plus all three domain panels
    (`TraceabilityPanel`, `LinkedTasksPanel`, `TestPlansPanel`).

## Files

| File | Status |
| ---- | ------ |
| `src/components/layout/EntityDetailLayout.tsx` | NEW — shell |
| `src/app/t/[tenantSlug]/(app)/controls/[controlId]/page.tsx` | refactored to use the shell |
| `tests/rendered/entity-detail-layout.test.tsx` | NEW — 14 rendered tests on shell |
| `tests/unit/control-detail-shell-adoption.test.ts` | NEW — 8 structural assertions on the controls page |
| `docs/implementation-notes/2026-04-30-entity-detail-layout-extraction.md` | NEW — this note |

## Tests added

**Rendered (14)** at `tests/rendered/entity-detail-layout.test.tsx`:
  - Header: back/title/meta/actions all render when supplied
  - Header: each slot omits cleanly when undefined (× 3)
  - Tabs: tablist + role="tab" + aria-selected
  - Tabs: count badge surfaces only when present
  - Tabs: click fires onTabChange with the right key
  - Tabs: tabpanel role + aria-labelledby pointing at active tab
  - Tabs: disabled tab is unclickable + reflects disabled attr
  - Tabs: tabs prop optional — body renders without tab bar
  - Lifecycle: loading replaces body with skeleton
  - Lifecycle: error replaces body with alert message
  - Lifecycle: empty replaces body with custom message

**Structural (8)** at `tests/unit/control-detail-shell-adoption.test.ts`:
  - Page imports `EntityDetailLayout` from the canonical path
  - Page mounts `<EntityDetailLayout>` as wrapper
  - All three domain panels still referenced
  - All seven tab branches still present
  - Sync-status badge ids preserved (E2E selectors)
  - Edit modal preserved
  - Page does NOT hand-roll the tab bar anymore (regression guard)
  - Tabs/activeTab/onTabChange contract threaded through the shell

## Verification

- `npx jest tests/rendered/entity-detail-layout.test.tsx tests/unit/control-detail-shell-adoption.test.ts` → **22/22**
- `npm run typecheck` → clean
- `npm run lint` → no warnings on touched files

## Decisions

  - **Why not a JSON-driven generic detail framework.** That was the
    explicit anti-pattern called out in the prompt. CISO-Assistant's
    `DetailView.svelte` actually goes the JSON route — generic
    field/section rendering — and the trade-off shows: their detail
    pages are uniform but the rich panels are weaker. We borrowed
    the *structural strength* (one shell across entities) without
    flattening the *content strength* (domain-specific React panels).

  - **Why a "tabs are optional" shell rather than two shells.** Some
    detail pages (risks, policies in their current form) stack
    sections instead of tabbing. Two shells would have meant the
    next risks refactor faces a header-style fork; one shell with an
    optional `tabs` prop means it's a one-prop addition when those
    pages eventually adopt tabs.

  - **Why tab content stays in the page.** The seven tab branches
    on the controls page are highly stateful (mutations, optimistic
    updates, dynamic imports, modals). Extracting them into a
    "tabs registry" would require either: (a) a runtime registry
    that loses TypeScript narrowing, or (b) a sibling component file
    per tab — eight files for one feature, no clear win. Keeping
    the tab branches inline makes the page longer but keeps every
    state hook adjacent to the JSX it serves.

  - **Why the headerMeta / headerActions extraction (instead of
    inline JSX in the props).** The controls header has ~80 lines of
    nested badges + Tooltips + SVG icons. Inlining that as a JSX
    expression in the `meta` prop would be unreadable. Extracting
    to two const-bound JSX chunks above the `return` statement is
    the lightest-touch shape that keeps the component flat.

  - **Why no migration of risks/policies/vendors/audits in this
    PR.** The prompt explicitly says "the abstraction is ready for
    reuse by other entities later." Each adoption is its own small
    PR with its own structural-ratchet test. Doing all four in one
    diff would (a) blow the PR size and (b) tightly couple the
    shell's API surface to each page's quirks before the design
    settles. The shell ships with one user (controls); future PRs
    bring the others over.

  - **Why the structural-ratchet test.** Without it, a future
    refactor could quietly re-introduce the inline tab bar or the
    inline header JSX and undo this work. The ratchet locks the
    shell-adoption invariant the same way Inflect locks every other
    cross-cutting refactor (Epic 52 list-page-shell coverage,
    Epic 41 widget guard, etc.).
