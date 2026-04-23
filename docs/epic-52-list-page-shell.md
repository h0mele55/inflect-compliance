# `<ListPageShell>` — viewport-clamped layout for list pages

## What it is

A layout primitive that pins page header / filters / pagination
footer to the top and bottom of the viewport while only the table
body scrolls. Solves the regression where pages with 50+ table rows
forced the whole document to scroll, hiding the header and breaking
sticky-header behaviour.

Lives at `src/components/layout/ListPageShell.tsx` with four slots:

| Slot | Behaviour |
|---|---|
| `<ListPageShell.Header>` | `flex-shrink-0` — keeps natural height. Use for the page title row + action buttons. |
| `<ListPageShell.Filters>` | `flex-shrink-0` — keeps natural height. Use for filter toolbars, KPI strips, tab selectors, banners. |
| `<ListPageShell.Body>` | `flex-1 min-h-0 overflow-hidden` on md+ — claims remaining viewport height. Wrap the primary `<DataTable fillBody>` here. |
| `<ListPageShell.Footer>` | `flex-shrink-0` — keeps natural height. Use for page-level action bars. |

The shell is a no-op on mobile (<md) — natural document scroll
resumes so touch behaviour stays predictable.

## When to use it (decision tree)

```
Is the page primarily a list of items rendered as ONE table?
├─ Yes  → Use <ListPageShell>. Wrap the DataTable in
│         <ListPageShell.Body> and pass `fillBody`.
│         Examples: Risks, Controls, Tasks, Evidence, Policies,
│         Vendors, Findings, Assets, Reports, Tests.
│
└─ No
   ├─ Multiple tables stacked vertically?
   │  → Don't use the shell. Add to EXEMPTIONS in
   │    tests/guards/list-page-shell-coverage.test.ts.
   │    Example: admin/api-keys (active + revoked stacked).
   │
   ├─ KPI strip + summary cards + sub-tables?
   │  → Don't use the shell. Treat as dashboard-class.
   │    Example: Coverage, admin/notifications.
   │
   ├─ Detail page with inline sub-tables?
   │  → Don't use the shell. The parent page sets layout.
   │    Example: Control detail showing related risks, billing
   │    page embedding BillingEventLog.
   │
   ├─ Wizard / multi-step flow?
   │  → Don't use the shell. Wizards manage their own layout.
   │    Example: risks/import.
   │
   └─ Dashboard?
      → Never. Dashboards are intentionally allowed to scroll.
```

## Quick reference — adding a new list page

1. **Wrap the page** in `<ListPageShell>` (default `gap-6` works
   for most pages).
2. **Slot the chrome** into `Header` / `Filters` / `Footer`.
3. **Wrap the DataTable** in `<ListPageShell.Body>` and pass
   `fillBody`.
4. **Run** `npx jest tests/guards/list-page-shell-coverage.test.ts`
   — the floor (`>= 12`) goes up automatically as you migrate; new
   files that import DataTable without the shell fail unless added
   to `EXEMPTIONS`.

## How `fillBody` works

`<DataTable fillBody>` composes these classes onto its outer
container and scroll wrapper at the `md:` breakpoint:

| Element | Classes |
|---|---|
| Outer container | `md:flex md:flex-col md:min-h-0 md:overflow-hidden` |
| Scroll wrapper | `md:flex-1 md:min-h-0 md:overflow-y-auto` |

These compose with the existing `min-h-[400px]` and `overflow-x-auto`
on the wrapper via tailwind-merge. Mobile keeps the legacy
behaviour; desktop gets the flex chain.

The `fillBody` prop is **opt-in** (default `false`). It's ignored
when the table isn't inside a flex column with a constrained height
(i.e. when no `<ListPageShell.Body>` parent exists), so passing it
on a page without the shell is harmless — but pointless.

## How the AppShell flex chain participates

The whole chain at `md:` and up:

```
<html>
  <body>
    <AppShell wrapper: md:h-screen md:overflow-hidden flex>
      <aside>                           — sidebar, full height
      <main flex-1 md:overflow-hidden md:flex md:flex-col md:min-h-0>
        <inner-div p-4 md:p-6 max-w-7xl mx-auto md:flex-1 md:min-h-0 md:overflow-y-auto md:w-full>
          <ListPageShell md:flex-1 md:min-h-0 flex flex-col gap-6>
            <Header flex-shrink-0>
            <Filters flex-shrink-0>
            <Body md:flex-1 md:min-h-0 md:overflow-hidden>
              <DataTable wrapper: md:flex md:flex-col md:min-h-0 md:overflow-hidden>
                <table-scroll-wrapper md:flex-1 md:min-h-0 md:overflow-y-auto>
                  <table>...</table>     — the only scrolling element
```

Critical: every flex parent in the chain carries `min-h-0`. Without
it, `flex-1` grows to content and the whole chain breaks
(content overflows the viewport, page scrolls). This is the
single most common bug when adding a new participant to the chain.

## Print

The shell root carries `data-list-page-shell="true"`. The print
stylesheet in `src/app/globals.css` targets that selector with
`overflow: visible`, `height: auto`, `max-height: none`,
`min-height: 0` so printers see the full table, not just the
viewport-visible rows.

## Related

- Phase 1 commit (foundation primitives): TBD
- Phase 2 migration commits (12 list pages): TBD
- Phase 3 ratchet + docs: TBD
- Tests: `tests/rendered/list-page-shell.test.tsx`,
  `tests/guards/list-page-shell-coverage.test.ts`
