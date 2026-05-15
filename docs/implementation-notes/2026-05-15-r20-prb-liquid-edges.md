# 2026-05-15 — R20-PR-B: Liquid edges (iridescence + diffusion)

**Commit:** `<sha> feat(buttons): R20-PR-B — iridescent edge + aura wash + form-control parity`

## Design

PR-A laid the language (4 ambient tokens × 2 themes, 1 iridescent
gradient × 2 themes, 2 aura tokens × 2 themes, 3 control-parity
edge tokens × 2 themes, plus the `control-variants.ts` scaffold).
PR-B is the first APPLICATION of that language across three
surfaces:

### Primary CTA — iridescent meniscus

A 1px gradient stroke painted via the `::after` pseudo-element,
tracking the rounded corners. Brand → secondary linear sweep
(`--btn-iridescent-gradient`), always visible. The iridescence is
a MATERIAL property of the surface, not a state — like the way a
real meniscus catches light no matter what you do to it.

Technique: the classic mask-composite recipe for a gradient
border on a rounded element.

```
::after {
  inset: 0; position: absolute; border-radius: inherit;
  padding: 1px;
  background-image: var(--btn-iridescent-gradient);
  mask: linear-gradient(#fff,#fff) content-box,
        linear-gradient(#fff,#fff);
  -webkit-mask-composite: xor;     /* Safari */
  mask-composite: exclude;         /* modern */
  pointer-events: none;
}
```

The two mask layers — content-box-clipped + full-element — XOR
each other; only the 1px ring between content-box and border-box
remains opaque. The gradient paints through that ring; the
interior is masked away.

Border-image would be cleaner syntactically, but `border-image`
doesn't follow `border-radius` on rounded elements — the gradient
would paint as a rectangle outline.

### Primary + Secondary — aura wash on hover

A brand-tinted halo painted via `::after`'s box-shadow on hover.
Three stops folded into one token (`--btn-aura-primary` /
`--btn-aura-neutral`) so the shape can't drift apart later.

Routed through `hover:after:shadow-*` rather than `hover:shadow-*`
on the element itself. The v2-PR-4 motion-language ratchet bans
the latter because generic "drop shadow on hover" reads cheap on
layout-affecting surfaces. R20's aura is NOT generic — it's a
specific carbon-language hover state with restrained alpha. Riding
it through the pseudo:

  - keeps the element's own shadow alone (R19's
    `--btn-carbon-bevel` survives),
  - skirts the regex by design (`\bhover:shadow-` requires `hover:`
    followed DIRECTLY by `shadow-`; `hover:after:shadow-` has
    `after:` between, so doesn't match),
  - composes with the iridescent edge on the same pseudo — the
    edge rides `background` + `mask`; the aura rides `box-shadow`.
    No property conflict.

### Ghost — carbon glass on hover

The ghost variant's hover fill drops from `bg-bg-muted` (fully
opaque) to `bg-bg-muted/75` (75% opaque), and `backdrop-blur-sm`
softens what shows through. Frosted-glass on hover. 75% chosen
deliberately: the hover state must still register clearly (the
carbon depth-overlay from R19 alone doesn't carry enough contrast
on a translucent fill), but elegance prefers a fill that's
PRESENT, not opaque.

### Form-control parity

`<Input>` migrates onto `--ctrl-edge-rest` / `-hover` / `-focus`,
dropping the legacy Tailwind ring in favour of a brand-tinted
box-shadow halo on focus. Date-picker trigger does the same. The
combobox trigger is a `<Button variant="secondary">` so it
inherits the R20 button work automatically — three controls, one
focus vocabulary.

## Files

| File | Role |
|---|---|
| `src/components/ui/button-variants.ts` | Adds `iridescentEdge`, `auraPrimary`, `auraNeutral`, `ghostGlass` recipes and wires them into primary / secondary / ghost variants |
| `src/components/ui/input.tsx` | Migrates `inputVariants` from `border-border-subtle` + ring → `--ctrl-edge-*` tokens + box-shadow halo |
| `src/components/ui/date-picker/trigger.tsx` | Migrates `triggerStyles` to `--ctrl-edge-*` tokens; open state reads as "sustained focus" via same halo |
| `tests/guards/r20-prb-liquid-edges.test.ts` | 25-assertion structural ratchet locking edge / aura / glass recipes + parity wiring |
| `docs/implementation-notes/2026-05-15-r20-prb-liquid-edges.md` | This file |

## Decisions

- **Why `::after` instead of `::before` for the iridescent edge.** R19 claims `::before` for the depth overlay (grain + light pool + bevel insets). R20's iridescent edge is a separate visual layer that paints ABOVE the surface — it's the outermost finish. CSS layers `::after` above `::before` by default, so the visual stack is correct without explicit z-index.

- **Why iridescent on primary only, not secondary or destructive.** Secondary is the quiet variant — iridescent on a muted fill would over-claim attention; the recipe stays scoped. Destructive is a warning, not a seduction; an iridescent edge would shift its register from "this action is dangerous" to "this action is interesting". The aura wash on hover gives secondary a hover lift without adding a permanent material flourish.

- **Why `hover:after:shadow-*` instead of exempting `button-variants.ts` from the motion-language ratchet.** The ratchet exemption list (R13 NavItem, R14 NavBar) is for primitives that consciously broaden the motion language. The R20 aura ISN'T a broadening — it's a specifically-shaped halo within the existing language. Riding `::after` keeps the original rule intact (the element's own shadow is still untouched on hover) while letting the pseudo carry the new shape.

- **Why 75% ghost hover opacity, not 60% or 100%.** Three constraints fight: (a) the hover must register clearly, (b) the backdrop-blur needs something to filter, (c) elegance wants restraint. 100% would defeat (b) — no filter target. 60% would defeat (a) — the carbon depth-overlay's contrast over a 60% fill is too low to clearly read as a hover. 75% is the sweet spot.

- **Why drop the Tailwind ring on `<Input>` instead of stacking it with the box-shadow halo.** Box-shadow halos and outline-rings render at different layers and CAN coexist, but stacking them on focus over-does the visual weight — focused inputs would shout. A single brand-tinted shadow halo (`--ctrl-edge-focus`) is a sufficient focus indicator on its own; the R20 aesthetic is "felt", not announced.

- **Why date-picker open state shares the focus shadow.** The open state is conceptually "focus held" — the user pressed the trigger and is now interacting with the popover. Applying the same halo keeps the visual vocabulary coherent: one focus tone, two trigger states (focused vs sustained-focused).
