# Epic 60 — Shared hooks & polish primitives (decision guide)

The Epic 60 platform owns the reusable React hooks and interaction
primitives that every dashboard, form, and settings screen in this
app should reach for. Hand-rolling these again is drift; this doc
tells you when and how to use the shared layer.

The authoritative surface is `@/components/ui/hooks` (barrel) and the
polish primitives under `@/components/ui/`. The guardrail at
`tests/guards/epic60-ratchet.test.ts` caps the count of known legacy
patterns and can only go down — reintroducing one fails CI.

---

## Hooks

### `useLocalStorage<T>(key, initialValue, options?)`

SSR-safe typed persistence. Hydration-safe (returns `initialValue`
first render, hydrates from storage in a mount effect), cross-tab
synced via `storage` events, corruption-safe JSON, custom
serializer/deserializer for `Date` / `BigInt` / `Map`.

| Reach for this | Use plain `useState` |
|---|---|
| Column visibility, filter presets, sidebar collapsed state, any preference that should survive a reload | One-off form draft, ephemeral modal state |
| Two tabs open on the same dashboard need to agree | Single-session state that resets on reload is fine |

Already wrapped: `useColumnVisibility` (don't re-implement column
visibility yourself — use it). Approved direct `localStorage`
callers: `src/lib/filters/filter-presets.ts` (quota-aware),
`src/components/theme/ThemeProvider.tsx` (SSR-guarded), and
`src/components/ui/table/column-visibility-utils.ts` (pre-Epic-60
helper reused by the hook).

### `useOptimisticUpdate<T>(value, { onError? })`

Framework-agnostic optimistic overlay. Takes your committed value
(from a fetcher, prop, or state), returns `{ value, isPending, update }`.
Call `update(optimisticValueOrFn, commitAsync)` — the overlay shows
instantly, rolls back if `commitAsync` throws, and stays until your
`value` reference changes (so the caller's refetch drops it
cleanly).

| Reach for this | Stick with sequential `await; setState` |
|---|---|
| Toggle/mark-as-read/status-flip where the user expects their click to stick visually | Form submits where the user expects a confirmation (spinner is the right affordance) |
| Perceived latency matters (>100ms round-trip, hot interaction path) | Background mutations the user doesn't wait on |
| You already handle the rollback case in onError | You'd rather the UI just lie briefly — don't, pick something else |

Existing consumer: `notifications/page.tsx` markRead. The rollback
happens via `onError → setList(rolledBack)`.

### `useEnterSubmit(options?)`

Enter-submit with IME + multiline safety. On a single-line input,
Enter fires; on a textarea, Cmd/Ctrl+Enter fires and bare Enter
inserts a newline. `Shift+Enter` always inserts a newline. IME
composition never submits.

| Reach for this | Don't |
|---|---|
| "Quick add" inputs (`addAsset`, `addEmail`, search dispatch, comment send) | Specialised multi-key handlers (Shift+Arrow range-pickers, filter-range-panel's commit-with-Shift) |
| Any form input where you currently write `onKeyDown={(e) => e.key === 'Enter' && handler()}` | Complex modifier chains — write the handler explicitly |

Existing consumers: OnboardingWizard asset-input + invite-email.

### `useInputFocused()`

`true` while an editable element has focus anywhere in the document.
Mirrors Epic 57's `isEditableTarget` policy so your "user is typing"
branch agrees with the shortcut registry.

Useful for fading hint bars / gating page-level shortcut overlays.
Don't use it to gate registered `useKeyboardShortcut` handlers —
those already skip editable targets automatically.

### `useScroll` / `useScrollProgress` / `useInViewport`

Viewport-observer hooks hardened in a prior Epic 60 prompt. SSR-safe,
cleanup-safe, IntersectionObserver-backed where possible. Use them
instead of hand-rolling `addEventListener('scroll', …)` with
manual cleanup.

---

## Polish primitives

### When to reach for each

```
Discrete-choice interaction?
├── Page-level section nav (tabs that drive the main content area)
│   └── <TabSelect>   ← role="tablist", roving tabindex, Arrow nav
├── Segmented control for mode/filter/status
│   └── <ToggleGroup> ← role="radiogroup", default | sm sizes
├── Multiple independent boolean choices
│   └── <Checkbox> / <Switch> (not Epic 60 — pre-existing)
└── Single-select from many items
    └── <Combobox>    (Epic 55 — not Epic 60)

Continuous / numeric interaction?
├── Bounded integer with a small range (1..10 range, stepper fits)
│   └── <NumberStepper>  ← +/- buttons, size="default" | "sm"
├── Continuous numeric range (percentage, volume, threshold)
│   └── <Slider>         ← Radix Slider, marks, formatLabel
└── Arbitrary numeric input (unbounded or >100 range)
    └── Plain <input> inside <FormField> — no Epic 60 primitive fits

Expandable content?
└── <Accordion>    ← Radix accordion, density="default|compact|flush"
```

### `<TabSelect>` vs. `<ToggleGroup>`

The visual difference looks small. The semantic difference is big:

- **TabSelect** is a **tablist** (ARIA `role="tablist"` + `role="tab"`).
  The selected tab drives the **content panel** underneath.
  Keyboard arrow nav does "automatic activation" (APG) —
  moving focus also moves selection, because focus IS navigation.
  Pass `idPrefix="tab-"` when your consumers depend on stable DOM
  ids (E2E selectors, for example).
- **ToggleGroup** is a **radiogroup** (ARIA `role="radiogroup"` +
  `role="radio"`). The selected value is a **parameter** that
  filters / modes content below. Think "view as list/grid", "time
  range: 7d/30d/90d", "status: all/open/closed".

If the selected value changes the **structure** of the content
(different panels, different fields) → TabSelect. If it's a **filter**
or **mode** applied to the same content → ToggleGroup.

### `<NumberStepper>` size variants

- `size="default"` (40px tall) — forms, settings rows.
- `size="sm"` (32px tall) — dense filter toolbars, tight grids
  like the Asset CIA 3-column layout or risk likelihood/impact pair.

Always pass `ariaLabel` — the input is `role="spinbutton"` and
screen readers announce it. Defaulting to "Number" isn't useful.

### `<Slider>`

Pass `ariaLabel` (required by Radix; lives on the Thumb where
`role="slider"` is). Use `formatLabel` for percentage / value
callouts. Not appropriate for <5 discrete choices — use ToggleGroup
instead.

### `<Accordion>`

Token-backed Radix accordion with `density` axis (default / compact
/ flush) and trigger variants (chevron / plus). Reach for it when
multiple independent content regions need to coexist on one page
with progressive disclosure — FAQ pages, grouped settings.

---

## Contributor checklist for new UI work

Before adding:

- [ ] **A new button-based tab bar** → use `<TabSelect>` (+ `idPrefix`
      if you need stable DOM ids).
- [ ] **A new filter / view-mode pill row** → use `<ToggleGroup>`.
- [ ] **A `<input type="number">`** → prefer `<NumberStepper>` if the
      range is bounded; keep raw input only when the range is large
      / unbounded AND you're inside `<FormField>`.
- [ ] **A `localStorage.setItem` call** → wrap with `useLocalStorage`
      unless you're writing quota-aware code like filter-presets.
- [ ] **An `onKeyDown={(e) => e.key === 'Enter' && …}`** → use
      `useEnterSubmit({ onSubmit })`.
- [ ] **An `await fetch(); setState()` pattern where the user clicked
      a toggle-like control** → consider `useOptimisticUpdate` for
      the perceived-latency win.

Import the barrel, not the deep path:

```tsx
// ✅
import { useLocalStorage, useEnterSubmit } from '@/components/ui/hooks';

// ❌ skips the barrel-completeness guard
import { useLocalStorage } from '@/components/ui/hooks/use-local-storage';
```

---

## Where the guardrails live

| Guardrail | What it enforces |
|---|---|
| `tests/guards/ui-hooks-barrel.test.ts` | Every `use-*.ts(x)` in `src/components/ui/hooks/` exports the expected hook and the barrel re-exports it |
| `tests/guards/epic60-ratchet.test.ts` | Count of inline Enter handlers, raw `<input type=number>`, and raw `localStorage` calls in `src/app/**` cannot increase |
| `tests/rendered/polish-primitives.test.tsx` | Accordion / TabSelect / ToggleGroup / Slider / NumberStepper render + a11y (axe) |
| `tests/rendered/observer-scroll-hooks.test.tsx` | IntersectionObserver / ResizeObserver / scroll hooks — SSR guards + cleanup |
| `tests/rendered/input-submit-hooks.test.tsx` | `useEnterSubmit` + `useInputFocused` behaviour (IME, Shift, modifier policy) |
| `tests/rendered/persistence-optimistic-hooks.test.tsx` | `useLocalStorage` (hydration, cross-tab) + `useOptimisticUpdate` (overlay, rollback) |
| `tests/rendered/epic60-rollout.test.tsx` | Five production integration points (policy tabs, CIA, onboarding Enter, notifications optimistic) |

## Related

- `src/components/ui/hooks/README.md` — hook-level conventions (naming, SSR safety, cleanup).
- `docs/implementation-notes/2026-04-22-epic-60-*.md` — four implementation notes (hooks foundation, observer/scroll, persistence/optimistic, input/submit, polish primitives, rollout, hardening).
- CLAUDE.md — "UI Platform — Epics 51–60" section references this guide from the Epic 60 row.
