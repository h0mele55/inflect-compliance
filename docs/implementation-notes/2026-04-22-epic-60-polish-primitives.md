# 2026-04-22 — Epic 60 polish primitives (Accordion / TabSelect / ToggleGroup / Slider / NumberStepper)

**Commit:** _(stamped post-commit)_

Brings the five Epic 60 polish primitives up to production quality:
token-backed (Epic 51), CVA-driven variants, keyboard-navigable with
APG-compliant ARIA, and axe-clean under WCAG 2.1 AA. All five had
placeholder implementations with hardcoded raw colours and gaps in
keyboard/screen-reader support — this prompt consolidates them into
shared primitives the dense enterprise screens can adopt without
having to second-guess accessibility or theming.

## Design

### Shared rules applied to every primitive

| Area | Rule |
|---|---|
| Colour | Raw `slate-*` / `neutral-*` / `#171717` → semantic tokens (`bg-bg-default`, `text-content-muted`, `border-border-subtle`, `text-content-emphasis`, `bg-bg-muted`). Light-mode parity guardrail now covers these primitives automatically. |
| Focus | `outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` on every interactive surface. Keyboard users get a visible, theme-aware ring. |
| Variants | CVA (`class-variance-authority`) for size / variant axes, matching the Epic 51 `buttonVariants` pattern so consumers recognise the shape. |
| Icons | `aria-hidden` on decorative icons so screen readers don't announce "arrow up right" after every tab label. |

### Per-primitive highlights

#### Accordion

- Radix Accordion under the hood, so keyboard (Arrow/Home/End,
  Enter/Space) and ARIA (`aria-expanded`, `role="region"`) are already
  right.
- `density: default | compact | flush` for reading vs. dense list uses;
  `size: default | sm` separately controls text scale.
- Trigger variant (`chevron | plus`) preserved — it's how the two
  existing design patterns (FAQ-style and settings-style) differ.

#### TabSelect

- Proper `role="tablist"` container, `role="tab"` buttons,
  `aria-selected`, **roving tabindex** (selected tab = 0, others = -1).
  None of that was present.
- Arrow / Home / End keyboard nav with APG-style automatic activation
  (moving focus commits selection). Tabs without `href` call
  `onSelect`; tabs with `href` remain `<Link>` and rely on the route
  change to update `selected`.
- `aria-controls` intentionally **omitted** — consumers own their
  panels, and a dangling `aria-controls` fails axe. The docblock tells
  consumers to wire `role="tabpanel"` + `aria-labelledby` on their
  panels; the tab button's `id` is `tab-${layoutGroupId}-${id}` so the
  panel can point at it.
- `disabled` on a single option removes it from the roving set so
  Arrow-nav skips it.

#### ToggleGroup

- Renders as `role="radiogroup"` with each button `role="radio"` +
  `aria-checked`. Link-mode options stay as `<Link>` and aren't tagged
  as radios (they're navigation — `aria-current="page"` instead).
- Arrow (all four) + Home/End keyboard cycling, roving tabindex,
  disabled-skips behaviour identical to TabSelect.
- `size: default | sm` for dense filter toolbars.
- The previous `@ts-expect-error` on the dynamic `As` tag is gone —
  the radio/link branches render separately now, so TypeScript can
  narrow each arm cleanly.

#### Slider

- Radix Slider gives keyboard (Arrow, PageUp/Down, Home/End) and ARIA
  (`role="slider"`, `aria-valuemin/max/now`) for free.
- The `aria-label` now lives on `RadixSlider.Thumb` (not `Root`) —
  Radix renders `role="slider"` on the thumb, so the label has to go
  there for screen readers to announce it.
- Optional `formatLabel(value)` renders a floating value bubble above
  the thumb — useful for percent sliders.
- All colours token-backed: track = `bg-bg-subtle`, fill + stub =
  `bg-content-emphasis`, mark dots = `bg-bg-default`, thumb body =
  `bg-bg-default` with inner dot `bg-content-emphasis`.

#### NumberStepper

- **Single** spinbutton announced to screen readers. The previous
  version had TWO nested `role="spinbutton"` nodes (input + an overlay
  div for `formatValue`) which double-announced the value. Now the
  input carries `role="spinbutton"` + `aria-label` + `aria-valuenow`;
  the formatter-mode overlay is a `button aria-hidden` that just
  routes clicks back into the input.
- `ariaLabel` prop added (previously undocumented); defaults to
  `"Number"` but consumers should pass specifics like `"Retention
  days"` — callsites all end up labelling the axis that's being
  stepped.
- `size: default | sm` for dense filter use.
- Clamp on both decrement and increment paths; buttons disable when
  hitting `min` / `max`.
- Keyboard: ArrowUp/Right increment, ArrowDown/Left decrement, Enter
  commits + blurs, Escape reverts the draft back to the last committed
  value (useful for partial / empty / non-numeric typing states —
  valid keystrokes commit eagerly via `onChange`, so Escape's
  "revert" semantic is about draft-not-yet-parsed states).

## Files

| File | Change |
|---|---|
| `src/components/ui/accordion.tsx` | Token-backed, CVA density/size/variant axes, decorative icons hidden to a11y tree |
| `src/components/ui/tab-select.tsx` | Proper tablist semantics, roving tabindex, Arrow/Home/End keyboard nav, disabled support, decorative icons hidden |
| `src/components/ui/toggle-group.tsx` | Token-backed, `size: default \| sm`, radiogroup semantics, keyboard nav, disabled support, link-mode uses `aria-current="page"` instead of radio semantics |
| `src/components/ui/slider.tsx` | Token-backed track/fill/thumb, `ariaLabel` moved to Thumb, optional `formatLabel` value bubble |
| `src/components/ui/number-stepper.tsx` | Token-backed, CVA size axis, `ariaLabel` prop, single spinbutton (no double-announce), cleaner typed keyboard handler |
| `tests/rendered/polish-primitives.test.tsx` | **new** — 30 tests: render + click + keyboard + a11y (axe) per primitive |

## Decisions

- **No consumer migration this prompt.** All five primitives had zero
  production consumers, which meant signature changes were free. The
  prompt deliberately stopped at making the primitives shippable —
  wiring them into existing pages is a rollout prompt that decides
  *which* pages get migrated first and in what order (the legacy
  date-range pills and filter sort-dropdowns are the obvious first
  candidates for ToggleGroup, for example).

- **Dropped `aria-controls` on TabSelect buttons.** axe correctly flags
  a dangling `aria-controls` reference (the panel doesn't exist until
  the consumer mounts one). The APG-accepted alternative — caller
  owns `role="tabpanel"` + `aria-labelledby` pointing back at the tab
  `id` — puts the association where the markup actually exists.

- **ToggleGroup Link-mode isn't a radio.** A link that navigates to
  `/status/open` isn't semantically "selected" among siblings, it's
  "you are currently here". `aria-current="page"` matches that reality
  and also plays correctly with screen readers that announce location
  changes. Radios would mis-communicate the behaviour.

- **Slider `aria-label` lives on the Thumb, not Root.** Radix renders
  `role="slider"` on each thumb, so the accessible name has to live
  there. Putting it on Root was invisible to screen readers — caught
  by the test, not by human eyes, and likely would have escaped
  review.

- **NumberStepper formatter-mode overlay is `aria-hidden`.** Previous
  implementation had an `tabIndex={0} role="spinbutton"` wrapping div
  ALONGSIDE the real input — screen readers announced the value twice
  and keyboard focus could land on the non-editable overlay. The
  overlay is now a decorative button that just forwards clicks; the
  real input remains the one and only spinbutton.

- **Escape-reverts-draft semantic is narrower than it sounds.**
  NumberStepper commits on each valid keystroke via `onChange`, so by
  the time Escape fires, the parent has already seen (and accepted)
  every parseable value. Escape's actual contract is "revert the
  draft for states that never committed" — empty string, bare minus,
  non-numeric junk. The test asserts exactly that narrower case and
  the component comments explain why.

- **CVA size axes, not "density" props across the board.** Different
  primitives use different axis names (`density`, `size`, `variant`)
  because the axes aren't the same thing everywhere — Accordion
  density changes the item *spacing* without touching text; ToggleGroup
  `size` changes padding *and* text scale in lockstep. Forcing one
  name across all five would collapse meaningful differences.

## Caveats

- **Accordion + TabSelect motion indicators use `motion.div`** —
  which means the reduced-motion story inherits whatever
  `prefers-reduced-motion` policy the global motion config applies.
  Epic 61 (if it touches motion) should audit this; for now the
  LayoutGroup transitions are fast enough (100ms / 250ms) that they
  don't register as disruptive.

- **No integration with `<FormField>` (Epic 55) yet.** NumberStepper
  and Slider are render-ready for bare composition, but neither
  auto-wires `aria-describedby` to a FormField's error/description
  slot. Consumers using FormField today pass `id` through manually
  and wire the association in their own JSX. A follow-up would add a
  FormField-aware wrapper.

- **Slider + NumberStepper don't share a labeled-value pairing
  helper.** The "slider + live number" dashboard pattern (Prompt
  stating "volume 25%") still requires the caller to wire both
  components by hand. An ambient pairing component is low-value
  boilerplate we'd rather not commit to until multiple screens need
  exactly the same pairing.
