# 2026-04-22 — Epic 60 rollout to production surfaces

**Commit:** _(stamped post-commit)_

Makes Epic 60 visible to real users. The three prior Epic 60 prompts
(hooks foundation, observer/scroll cluster, polish primitives) built
the shared surface but had zero production consumers. This prompt
picks five high-ROI integration points and threads the new primitives
through — one tab bar, four numeric inputs, two Enter-submit inputs,
one optimistic mutation. Every change is a drop-in upgrade that
preserves the existing contract (stable selectors, numeric values,
API payloads) so no downstream integration breaks.

## Design — why these five sites

We picked rollout candidates on two axes:

1. **User-visible value.** Does this change make someone's flow
   noticeably better — faster, more accessible, more keyboard-friendly?
2. **Maintenance return.** Does this delete hand-rolled code we'd
   otherwise have to keep patching for IME / browser quirks / a11y?

The candidates we deliberately skipped:
- **Risks / Controls / Evidence list pages** — already use
  `useColumnVisibility` (which wraps `useLocalStorage`). Already Epic
  60-native. No action needed.
- **Dashboard time-range pills** — we looked; there's no hand-rolled
  segmented control on the dashboard today, so `ToggleGroup` had no
  drop-in victim. Deferred until a real consumer surfaces.
- **Command palette / keyboard shortcuts** — already on the Epic 57
  registry. `useInputFocused` would only change render branches, not
  user-facing behaviour. Deferred.
- **Control detail page's 7-tab nav** — the audit flagged it as a
  TabSelect candidate, but the 7 tabs include lazy-loading side
  effects and deeper routing semantics. A bigger refactor than a
  rollout prompt should do; the policy detail page (4 tabs, pure
  state) was the safer first customer.

## Integrations

### 1. `<TabSelect>` on the policy detail page

**File:** `src/app/t/[tenantSlug]/(app)/policies/[policyId]/page.tsx`

Replaces the hand-rolled tab bar (a `div` + `.map` of styled buttons
with manual selected state + no keyboard nav) with the shared
`<TabSelect>`. The manual version had:

- no `role="tablist"` / `role="tab"` → screen readers announced it
  as a group of buttons
- no roving tabindex → Tab key stepped through every tab button
  one-by-one instead of jumping past the group
- no Arrow/Home/End keyboard nav
- no focus ring styles that match the rest of the app

**Contract preserved:** `idPrefix="tab-"` keeps the DOM ids
(`#tab-current`, `#tab-versions`, `#tab-editor`, `#tab-activity`) —
the selectors `tests/e2e/policies.spec.ts` uses continue to work
(`page.click('#tab-activity')` etc.).

**Primitive change:** Added an `idPrefix` option to `TabSelect` so
consumers with long-lived DOM-id contracts can pin the prefix instead
of accepting the default `useId()`-namespaced one.

### 2. `<NumberStepper>` on the policy review-frequency field

**File:** same policy detail page (review-schedule editor)

Replaces `<input type="number" className="input w-24">` with
`<NumberStepper>`. Wins:

- Visible +/- buttons → mouse users don't have to triple-click the
  field to edit, and touch users don't have to summon the numeric
  keyboard.
- `formatValue={(v) => ${v} days}` → the non-focused presentation
  shows "30 days" instead of the bare number, removing the need for
  a separate "days" label suffix.
- Bounded clamp (`min={1}, max={3650}`) with buttons that disable
  at bounds → impossible to type 99999 into an input the server
  will reject.

**Contract preserved:** `reviewDays` stays a string in state; we
just mediate it as `String(v) / Number(...)` at the boundary so
`saveReview()`'s `parseInt(reviewDays)` continues unchanged.

### 3. `<NumberStepper size="sm">` × 3 on Asset CIA fields

**File:** `src/app/t/[tenantSlug]/(app)/assets/AssetsClient.tsx`

Replaces three bare `<input type="number" min="1" max="5">` fields
for Confidentiality / Integrity / Availability (the ISO 27005 impact
scale 1..5). Each field had:

- no `aria-label` → screen readers announced "edit text" with no
  context
- no visible label association (the surrounding `<label>` didn't wrap
  the input and had no `htmlFor`)
- no +/- buttons; users had to either type or use native spinners
  that most browsers only show on hover
- no keyboard ArrowUp/Down support out of the box across all browsers

Now each is a properly-labeled `<NumberStepper size="sm" ariaLabel="…" min={1} max={5}>`.
The `sm` variant keeps the 32px-tall row compact inside the 3-column
grid the form uses.

**Contract preserved:** `onChange={(v) => setForm(f => ({ ...f, …: v }))}`
receives a numeric `v` — exactly what the old `+e.target.value` path
produced.

### 4. `useEnterSubmit` × 2 on OnboardingWizard

**File:** `src/components/onboarding/OnboardingWizard.tsx`

Two inputs (asset name, invite email) used the inline pattern:

```tsx
onKeyDown={(e) => e.key === 'Enter' && addAsset()}
```

Replaced with `useEnterSubmit({ onSubmit: addAsset })`. Wins:

- IME composition guard: Japanese / Chinese / Korean users typing a
  candidate no longer fire `addAsset()` when they hit Enter to commit
  the candidate.
- `Shift+Enter` preserved as newline (future-proofing — if either
  input ever becomes a textarea for pastes).
- One less inline arrow function per render → React can bail out of
  a button/input re-render when props are referentially stable.

### 5. `useOptimisticUpdate` on notifications

**File:** `src/app/t/[tenantSlug]/(app)/notifications/page.tsx`

The previous `markRead` was *sequential* — `await fetch(); setState;` —
so every click felt ~100-300ms laggy while the round-trip landed.
Worse, there was no failure handling: a 500 would leave the UI
claiming the notification was read forever.

Now `update((prev) => readTrue, commitFetch)` shadows the list with
`read=true` the instant the user clicks. On 2xx, `setList` commits the
canonical state (new reference → overlay clears). On non-2xx,
`onError` restores the prior list and the "mark read" button
reappears so the user knows the click didn't stick.

The visible UX delta is ~200ms of perceived responsiveness per click,
and the correctness delta is "errors no longer look like successes".

## Files

| File | Change |
|---|---|
| `src/app/t/[tenantSlug]/(app)/policies/[policyId]/page.tsx` | Manual tab bar → `<TabSelect>` (preserves `#tab-*` selectors); review-days `<input type=number>` → `<NumberStepper>` |
| `src/app/t/[tenantSlug]/(app)/assets/AssetsClient.tsx` | CIA triple of bare number inputs → `<NumberStepper size="sm">` × 3 with proper labels |
| `src/components/onboarding/OnboardingWizard.tsx` | 2 inline `onKeyDown` → `useEnterSubmit({ onSubmit })` |
| `src/app/t/[tenantSlug]/(app)/notifications/page.tsx` | `markRead` rewritten as optimistic-overlay via `useOptimisticUpdate` + rollback on fetch failure |
| `src/components/ui/tab-select.tsx` | Added `idPrefix` option so consumers can pin stable DOM ids |
| `tests/rendered/epic60-rollout.test.tsx` | **new** — 12 integration tests for the 5 rollout sites |

## Decisions

- **Preserve selectors over prettier ids.** The `idPrefix="tab-"`
  escape hatch keeps `tests/e2e/policies.spec.ts` working
  unchanged. Taking the hit of a migration across two E2E files to
  match a new `#tab-:r0:-current` pattern would have no user benefit
  and real regression risk.

- **String / number adapter at the review-days boundary, not a deeper
  refactor.** The policy page stores `reviewDays` as a string so the
  existing save path (`parseInt`) keeps working. A deeper type
  migration to "review days are numbers" crosses enough files to be
  its own prompt.

- **Optimistic rollback routes through `onError` + explicit
  `setList`.** The hook's overlay clears automatically when `value`
  reference changes, but on error we need to explicitly re-commit the
  rolled-back value so `value` itself moves. Trying to be cleverer
  (overlay-sees-its-own-rollback via ref drift) would couple the hook
  to a specific fetcher shape.

- **Did NOT migrate `admin/members` role change optimistically.** The
  audit flagged it, but that mutation has a multi-field payload
  (`role` + `customRoleId`) touching a table row inside a fetch-list
  pattern. Overlaying a single value with `useOptimisticUpdate<T>`
  would mean overlaying the entire `members[]` array on a simple
  select-change. The complexity-to-benefit ratio is wrong for this
  prompt; notifications was the cleaner first optimistic-update
  customer because `markRead` is unambiguously single-field-per-row.

- **Did NOT migrate the control-detail 7-tab nav.** Same tabselect
  win would apply, but it also lazy-loads content on tab change,
  which couples with React Query prefetch timing. Separate prompt.

## Caveats

- **Policy `tabItems` is a non-tuple array** — because the `editor`
  entry is spread from a conditional, TypeScript widens it to
  `string[]`. The `TabSelect<'current' | 'versions' | 'editor' | 'activity'>`
  generic forces the right type at the call site, but we had to cast
  each `id: t as ...` in the options map. Could be cleaned up by
  typing `tabItems` as a discriminated literal-list, but not worth a
  second refactor for a single call site.

- **Notifications `useOptimisticUpdate` pattern leaks a tiny amount
  of ceremony.** Three pieces have to stay in lockstep: the overlay
  update function, the in-`commit` setList, and the `onError`
  setList. A thin wrapper hook (`useOptimisticListItem(id, fetcher)`)
  could encapsulate this, but we didn't build one — one concrete
  consumer isn't a pattern yet.

- **No axe-core coverage was re-run on migrated pages** — the
  integration tests assert ARIA + structure but don't re-run the
  full axe check on the rendered policy page. The primitives
  themselves are axe-clean (verified in `polish-primitives.test.tsx`)
  and the rollout doesn't change surrounding markup, so the page-level
  a11y posture is improved, not regressed. A proper axe pass on each
  migrated page is a good follow-up but out of scope here.
