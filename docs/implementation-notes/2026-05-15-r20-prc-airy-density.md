# 2026-05-15 — R20-PR-C: Airy density + typography

**Commit:** `<sha> feat(buttons): R20-PR-C — airy density + per-size tracking + label parity`

## Design

PR-A laid the language. PR-B applied liquid edges. PR-C is the
typographic-rhythm round. Three felt characteristics of "expensive
type" land in lockstep:

### 1. Padding scale revision

md and lg gain horizontal breathing room; xs/sm stay compact by
intent.

| Size | Before | After | Delta |
|---|---|---|---|
| xs | `px-2.5` | `px-2.5` | — |
| sm | `px-3`   | `px-3`   | — |
| md | `px-3.5` | `px-4`   | +2px |
| lg | `px-5`   | `px-6`   | +4px |

Heights stay (R20-PR-A lockstep with `<Input>` size scale).

### 2. Per-size tracking

The R19-PR-C flat `tracking-[-0.01em]` on the cva BASE is replaced
by a size-conditional scale.

| Size | Tracking | Felt characteristic |
|---|---|---|
| xs | `+0.005em` | tiny labels open up — legibility |
| sm | `+0.01em`  | confident small-caps feel |
| md | `-0.005em` | subtle default-size confidence |
| lg | `-0.01em`  | deepest headline rhythm |

Small text wants OPEN tracking to stay legible (classic
small-caps confidence); large text wants TIGHT tracking to feel
deliberate. The R19 design intent (deepest tightening at the
featured size) is preserved — it's just expressed per-size now.

### 3. Gap rhythm

| Size | Before | After |
|---|---|---|
| xs | `gap-1`     | `gap-1`     |
| sm | `gap-1.5`   | `gap-1.5`   |
| md | `gap-tight` | `gap-tight` |
| lg | `gap-tight` | `gap-2.5`   |

The airy-padded lg button would look icon-cramped at 8px gap; 10px
restores the proportions.

### Form-control parity

`<Label>` gains the same `tracking-[-0.005em]` as button md. A
focused input + its label now share not just border tone (PR-B) but
typographic rhythm too — "expensive type" on the whole form row.

## Files

| File | Role |
|---|---|
| `src/components/ui/button-variants.ts` | New per-size `tracking-*` values; `px-4` / `px-6` / `gap-2.5` for md/lg |
| `src/components/ui/button.tsx` | Mirror the airy density scale in the disabled + disabledTooltip fallback paths (which don't route through the cva variant) |
| `src/components/ui/label.tsx` | Label gains `tracking-[-0.005em]` |
| `tests/guards/r19-prc-carbon-hover-grain.test.ts` | Loosen the R19 base-tracking assertion to "tracking-`-0.01em` lives somewhere in the file" — the R20-PR-C ratchet locks the actual per-size scale, so the old base-pinned assertion no longer fits |
| `tests/guards/r20-prc-airy-density.test.ts` | 21-assertion ratchet locking padding scale, tracking per size, gap rhythm, disabled-state mirror, label parity |
| `docs/implementation-notes/2026-05-15-r20-prc-airy-density.md` | This file |

## Decisions

- **Why xs/sm stay compact at the existing padding scale.** Density is a feature at small sizes — xs/sm buttons are usually in dense UI (filter toolbars, table action menus, kbd shortcuts). Adding horizontal padding at those sizes would make rows feel sparse rather than airy. The "airy" intent applies at md/lg, where buttons are featured.

- **Why xs/sm get POSITIVE tracking (opening up) while md/lg get NEGATIVE tracking (tightening).** Small text fundamentally wants open tracking to stay legible — that's why small-caps designs (e.g., classic newspaper headlines) use letter-spacing. Large text fundamentally wants tight tracking to feel deliberate — that's why magazine headlines look like Helvetica with 1-3% negative tracking. The R20 scale follows that classical rule.

- **Why `<Label>` matches button-md tracking specifically.** Labels typically sit above `<Input>` controls that pair with md-sized buttons in filter toolbars. Aligning the label tracking to the button-md tracking creates a typographic alignment between the row's controls.

- **Why the R19-PR-C ratchet got softened instead of deleted.** The R19 invariant ("button-variants.ts carries tightened tracking") is still true — it just lives on the lg size now, not the cva base. Softening the assertion to "lives somewhere" preserves the regression boundary (a future PR that strips ALL tracking still trips this) while letting R20's per-size scale land cleanly.

- **Why the disabled-state mirror in `button.tsx` is locked structurally.** The button has TWO render paths: the cva variant (interactive) and a hand-rolled fallback (disabled / loading). The fallback doesn't route through the cva, so a future PR that updates the cva sizes but forgets the fallback would create a button that *changes dimensions* when disabled — a visible jitter on every disabled form. The R20-PR-C ratchet locks the two scales together so the drift is caught structurally.

- **Why no icon micro-shift on hover for `iconRight`.** Originally scoped for PR-C, but `group-hover:translate-*` is banned by the v2-PR-4 motion-language ratchet (and rightly — it's exactly the kind of decorative motion the rule exists to prevent). Doing it via an exempt would broaden the language for one micro-effect; not worth the cost. Skipped from R20 entirely.
