# 2026-04-23 — list-page-shell (viewport-clamped table scroll)

**Commits:** Phase 1 (foundation), Phase 2 (12 page migrations), Phase 3 (ratchet + docs).

## Design

User complaint: list pages with many rows force the whole document
to scroll. Page header, filter toolbar, and pagination footer
disappear above the fold; the sticky table header is anchored to
the wrong scroll context.

Fix: the AppShell main column becomes a viewport-clamped flex
chain at md+. List pages opt in to a new `<ListPageShell>` layout
primitive whose `Body` slot constrains its child `<DataTable
fillBody>` to fill the remaining viewport height. Inside the
DataTable, only the table body scrolls.

Mobile (<md) is byte-for-byte unchanged — natural document scroll
preserved so touch behaviour stays predictable.

The flex chain that carries the layout (top to bottom):

```
AppShell wrapper (md:h-screen md:overflow-hidden flex)
  → main (md:overflow-hidden md:flex md:flex-col md:min-h-0)
    → inner-div (md:flex-1 md:min-h-0 md:overflow-y-auto)
      → ListPageShell (md:flex-1 md:min-h-0 flex flex-col)
        → Header / Filters (flex-shrink-0)
        → Body (md:flex-1 md:min-h-0 md:overflow-hidden)
          → DataTable container (md:flex md:flex-col md:min-h-0 md:overflow-hidden)
            → table-scroll-wrapper (md:flex-1 md:min-h-0 md:overflow-y-auto)
              → <table> with sticky header
```

Every flex parent carries `min-h-0` so children can shrink below
their content size. Without it the chain silently breaks.

## Files

| File | Role |
|---|---|
| `src/components/layout/AppShell.tsx` | `<main>` becomes a flex column with `overflow-hidden` at md+; inner div becomes `flex-1 min-h-0 overflow-y-auto` |
| `src/components/layout/ListPageShell.tsx` | New layout primitive with `Header`, `Filters`, `Body`, `Footer` slots |
| `src/components/ui/table/data-table.tsx` | New `fillBody` prop (opt-in, default false). Composes the flex-fill classes onto the existing slots |
| `src/app/globals.css` | Print stylesheet escape: `[data-list-page-shell="true"]` subtree gets `overflow: visible` so printers see the full table |
| `tests/rendered/list-page-shell.test.tsx` | Locks the class-name contract on the shell + `fillBody` |
| `tests/guards/list-page-shell-coverage.test.ts` | Ratchet: every DataTable consumer must wrap in shell OR be in `EXEMPTIONS` with a written reason |
| `docs/epic-52-list-page-shell.md` | Decision tree for "use the shell or exempt?" |
| 12 page Client components | Wrap in `<ListPageShell>` + `fillBody` (Risks, Controls, Tasks, Evidence, Policies, Vendors, Findings, Assets, Reports, Tests, TestsDue, AdminClient) |

## Decisions

- **Opt-in `fillBody` default kept.** Considered flipping to true
  but the risk of breaking sub-tables in detail pages
  (control detail showing related risks, etc.) outweighs the
  cleanup payoff (12 pages drop one prop). The ratchet enforces
  consistency at the page level instead.

- **No `<DataTable>` runtime context coupling.** A React
  ListPageShellBodyContext could let DataTable detect the parent
  and self-apply `fillBody`. Skipped — adds runtime cost for a
  prop the user is already typing once per page.

- **Mobile is a no-op.** Internal-scroll tables on small screens
  trap touch gestures and feel broken. The whole chain is gated
  on `md:` prefixes; below md the layout is byte-for-byte the
  pre-Phase-1 behaviour.

- **Restrictive exemption list, not auto-detection.** The ratchet
  uses an explicit `EXEMPTIONS` map with one-line reasons rather
  than heuristics ("looks like a dashboard"). Exemptions force a
  PR-author-and-reviewer conversation about whether the page
  genuinely needs natural scroll or is just lazy.

- **Print stylesheet escape.** Without it, printing a viewport-
  clamped page would only print rows visible above the fold. The
  shell root carries a `data-list-page-shell="true"` hook the
  print rules target.

- **`min-h-[400px]` on the table scroll wrapper retained.** Mobile
  keeps it (preserves the empty-state height); desktop overrides
  via the `md:min-h-0` class composed by `fillBody`. Tailwind-merge
  resolves the conflict at the right breakpoint.

- **Pages with multiple stacked tables (admin/api-keys) or
  dashboard-style multi-card layouts (Coverage, admin/notifications,
  admin/integrations) explicitly exempted.** Viewport-clamping a
  multi-table layout would make one table scroll internally while
  another stays static — confusing UX. These remain on natural
  scroll.

- **Coverage floor at 12, not "must-equal-N"**: a future PR
  removing the shell from a migrated page would silently drop the
  count. The floor `>= 12` forces the contributor to either bump
  the number (impossible without removing the migration) or have
  a code-review conversation about why the page is being demoted.
