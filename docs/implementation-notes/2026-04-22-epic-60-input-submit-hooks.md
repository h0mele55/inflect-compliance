# 2026-04-22 — Epic 60 input / submit hooks

**Commit:** _(stamped post-commit)_

Final piece of the Epic 60 core hook layer: the
`useEnterSubmit` + `useInputFocused` pair that form-heavy screens rely
on for keyboard ergonomics. Both hooks had placeholder implementations
— this prompt makes them production-safe, IME-aware, and aligned with
the Epic 57 keyboard-shortcut contract so consumers get one consistent
"user is typing" signal across the app.

## Design

### `useEnterSubmit` — the "don't hijack multiline" rule

```
Scenario                        Before              After
────────                        ──────              ─────
<input>, bare Enter             submit (✓)          submit (✓)
<textarea>, bare Enter          no submit (✓        no submit (✓ — native
                                 by default —        newline preserved)
                                 metaKey required)
<textarea>, Cmd+Enter           submit (✓)          submit (✓)
<textarea>, Ctrl+Enter          IGNORED — only      submit (Linux/Windows
                                 metaKey checked     users now work)
<input>, IME composing          submit fires,       no submit — user's
                                 cancels the         composition protected
                                 candidate
<any>, Shift+Enter              submit fired on     no submit — Shift+Enter
                                 Shift+Cmd+Enter     is the universal
                                 path                "new line, don't send"
<input> outside a <form>,       no submit target    opts.formRef fallback
 no formRef                                          OR opts.onSubmit
                                                     callback
```

The hook now takes an options object:

```ts
useEnterSubmit({
  formRef?,       // explicit form ref
  onSubmit?,      // callback — bypasses form lookup
  modifier?:      // 'auto' (default) | 'always' | 'modifier'
  enabled?,       // disable without unmounting
  stopPropagation?,
})
```

The previous signature (`useEnterSubmit(formRef?)`) had zero consumers,
so the change is free.

### `useInputFocused` — mirror of Epic 57's editable-target policy

Epic 57's shortcut registry already decides "is the user typing?" by
inspecting `event.target`. Consumers that branch on focus (fading hint
bars, gating `?` help overlays) need the SAME answer — otherwise the
shortcut registry silently skips a shortcut the consumer's badge said
was active.

Updated to match Epic 57's `isEditableTarget` verbatim:

- `INPUT` / `TEXTAREA` / `SELECT`
- `contenteditable` / `[contenteditable="true"]`
- `role="textbox" | "combobox" | "searchbox"`
- `isContentEditable` computed property (covers Lexical, Tiptap, cmdk)

Also hydrates from `document.activeElement` on mount so a user who was
focused on a field when the consumer mounted reads `true` immediately
(previous version lied until the next `focusin`). SSR-safe: returns
`false` before mount.

## Files

| File | Change |
|---|---|
| `src/components/ui/hooks/use-enter-submit.ts` | Rewritten: options object, modifier policy, IME guard, Shift-wins-newline, cross-platform Cmd/Ctrl, `onSubmit` escape hatch, `stopPropagation` for overlay contexts |
| `src/components/ui/hooks/use-input-focused.ts` | Rewritten: SSR guard, mount-time hydrate from `document.activeElement`, contenteditable + role=textbox/combobox/searchbox support |
| `src/components/ui/hooks/index.ts` | Exports new option / policy / result types |
| `src/components/ui/hooks/README.md` | Submit/input/keyboard category row expanded to reflect the new semantics |
| `tests/rendered/input-submit-hooks.test.tsx` | **new** — 23 tests covering bare Enter / Shift / Cmd / Ctrl / IME / form-ref fallback / onSubmit callback / stopPropagation / focus variations |

## Decisions

- **Shift+Enter always inserts a newline, even when `modifier: 'always'`
  is set.** Users reach for Shift+Enter specifically to mean "new line,
  don't send" (every chat app, every rich editor). Overriding that
  would be a papercut for keyboard-heavy users who wouldn't expect an
  option named "always" to reinterpret the universal newline shortcut.

- **IME composition guarded by both `isComposing` AND keyCode 229.**
  `event.nativeEvent.isComposing` is the modern signal, but synthetic
  events in some jsdom paths drop it. keyCode 229 is the legacy
  in-composition sentinel every browser still emits. Checking both
  costs nothing and saves CJK users from submit-on-candidate-select.

- **Modifier policy enum with three values, not a boolean.** A bool
  (`requireModifier: boolean`) can't express "auto: pick based on
  element type". The three-way enum makes every intent explicit:
  `auto` for the 99% case, `always` for single-line fast paths where
  you've disabled newline insertion another way, `modifier` for
  dangerous submits you want to slow down slightly.

- **`onSubmit` callback takes precedence over form lookup.** Quick-add
  inputs (onboarding's "add asset" row, filter search boxes) aren't
  inside a `<form>` and don't want to be — wrapping every quick-entry
  in a form just to satisfy the hook would be boilerplate. The
  callback path lets the hook stay useful for those cases while the
  form path stays the default.

- **`stopPropagation` defaults to `false`.** A keydown that submits a
  form should still bubble up to Epic 57's window-level listener so
  overlay-scope shortcuts behave correctly. Callers inside modals who
  need to stop the bubble can opt in explicitly — which matches
  Epic 57's own `stopPropagation` default.

- **`useInputFocused` mirrors Epic 57's target detection rather than
  re-deriving it.** If the two diverge, a consumer branch like
  `if (!isInputFocused) { /* show shortcut hint */ }` could render a
  hint for a shortcut that Epic 57's registry refuses to fire. Keeping
  the two in sync is a contract worth enforcing by code convention
  (the two functions should look identical at a glance, and the test
  suite exercises the same permutations).

- **`useInputFocused` does NOT track focus WITHIN a specific ref.** The
  existing call sites that want per-ref focus use native
  `onFocus`/`onBlur`. This hook answers the global question "is the
  user typing anywhere?". Restricting scope would require a ref
  argument that 100% of callers would pass as the document root.

## Non-goals

- **No `useInputFocusedWithin(ref)` variant.** Callable space for a
  scoped version was considered, but the Epic 57 alignment is the
  primary value and adding a second hook with overlapping responsibility
  would blur the rule. If a real use case surfaces, the scoped version
  can be added as a separate hook (`useFocusWithin`) rather than
  overloading this one.

- **No `modifier: 'shift'` option.** Shift+Enter as a SUBMIT trigger
  (inverse of the newline default) was considered and rejected — no
  existing product muscle memory maps Shift+Enter to submit, and
  stealing it would conflict with the newline-insert behaviour that
  other parts of the UI deliberately rely on.
