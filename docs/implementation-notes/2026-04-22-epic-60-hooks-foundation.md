# 2026-04-22 — Epic 60 utility-hook foundation

**Commit:** _(pending — will stamp on commit)_

Epic 60's scope is a reusable utility-hook + UI-polish layer. This
prompt is the FOUNDATION — directory structure, barrel, conventions,
guardrail — not the hook implementations themselves (the hooks mostly
already exist; the new work is making them discoverable and the home
defensible).

## Design

```
src/components/ui/hooks/          ← Epic 60 canonical home
  README.md                         ← conventions + category manifest
  index.ts                          ← barrel (single import path)
  use-local-storage.ts              (persistence)
  use-in-viewport.tsx               (viewport)
  use-intersection-observer.ts      (viewport)
  use-media-query.ts                (viewport)
  use-resize-observer.ts            (viewport)
  use-responsive-presentation.ts    (viewport)
  use-scroll.ts                     (scroll)
  use-scroll-progress.ts            (scroll)
  use-optimistic-update.ts          (optimistic UI)
  use-enter-submit.ts               (submit/input)
  use-input-focused.ts              (submit/input)
  use-keyboard-shortcut.tsx         (submit/input — shim over lib/hooks)
  use-column-visibility.ts          (dense-table ergonomics)
  use-copy-to-clipboard.tsx         (clipboard)

src/lib/hooks/                    ← data/domain hooks — distinct home
  use-api.ts, use-controls.ts, use-risks.ts, …

src/components/<feature>/use-*    ← feature-local hooks, stay put
  (e.g. src/components/ui/table/use-table-pagination.tsx)
```

Three homes, one rule each:

- `src/components/ui/hooks/` — shared UI utility hooks. No data
  fetching, no server-only code. Epic 60's subject.
- `src/lib/hooks/` — typed domain + data-fetching hooks. Think
  `useControls`, `useRisks`, `useCreateRisk`. Plus cross-cutting
  platform hooks like `useKeyboardShortcut` / `useApi`.
- `src/components/<feature>/` — hooks tightly coupled to one primitive
  stay with the feature they serve.

The `src/components/ui/hooks/use-keyboard-shortcut.tsx` file in this
module is a 25-line compatibility shim over `@/lib/hooks/use-keyboard-shortcut`
— the Epic 57 implementation is platform-wide (Provider + key parser
+ priority model + palette integration), so it legitimately lives in
lib/hooks and is re-exported here for discoverability.

## Files

| File | Change |
|---|---|
| `src/components/ui/hooks/index.ts` | Barrel re-written with category comments + missing type exports (`UseCopyToClipboardOptions` / `UseCopyToClipboardResult` / `CopyOptions` / `CopyFn`) |
| `src/components/ui/hooks/README.md` | **new** — conventions: where hooks live, naming, SSR-safety patterns, cleanup patterns, how to add a hook, import rules |
| `tests/guards/ui-hooks-barrel.test.ts` | **new** — file-scan guardrail: every `use-*.ts(x)` in the directory must export its canonical hook AND appear in the barrel; barrel references must point at files that exist |

No hook files were moved or renamed. The 14 existing hooks stayed
exactly where they were — the prompt's non-negotiable against
"scattering new hooks" applies to future additions, not to an
organisational reshuffle that would churn every import.

## Decisions

- **Keep `src/components/ui/hooks/` as the canonical home.** It
  already existed with 14 hooks and a partial barrel; the team had
  established the convention but nobody had documented it. Moving the
  home to `src/lib/hooks/` would churn 14 files + require a larger
  split elsewhere. Respecting the existing layout was cheaper.

- **Two homes for hooks, not one.** `src/lib/hooks/` has meaningful
  existing consumers (12+) of data-fetching hooks — `useControls`,
  `useRisks`, `useApi`, etc. Collapsing them into
  `src/components/ui/hooks/` would put tRPC-like surface alongside
  SSR-hydration utilities. Two homes, two responsibilities, one
  README explaining the split is cleaner than forced collapse.

- **Category-grouped barrel, flat file layout.** No sub-directories
  per category — those add navigation friction in the IDE for a set
  that's only 14 hooks. Instead the barrel groups by category in
  `///── <Category> ─` comment blocks, so the barrel itself is the
  manifest. When a hook gets added, the author picks a category
  section to drop the export line into.

- **Guardrail is a file-scan, not a module-resolve.** The test reads
  files from disk and pattern-matches exports. No `require`, no
  jsdom. Runs in <1s under `tests/guards/`. Catches (a) new file
  without barrel entry, (b) barrel entry pointing at deleted file,
  (c) hook with wrong export name. TypeScript's `tsc --noEmit` covers
  the "does it actually resolve" question.

- **`use-keyboard-shortcut.tsx` shim stays in place.** The Epic 57
  implementation is too broad to move wholesale. The shim costs 25
  lines + a README line, and makes the ui/hooks barrel consistent
  without forcing a rename/move. Documented explicitly so a future
  contributor doesn't "clean up" the shim and break consumers.

## Remaining non-blocking caveats

- **Zero existing consumers import from the barrel path today** —
  every call site either uses deep-file imports or hasn't adopted the
  barrel yet. Not a bug; the barrel works, it's just optional. Later
  Epic 60 prompts will migrate call sites to the barrel as they land.

- **`use-hydrated-now` sits in `src/lib/hooks/`** but is arguably a
  pure UI utility (client-side hydration detection, no data layer).
  Left in place — moving would churn 5 client-file imports and the
  hook is stable. If it grows siblings, revisit the home.

- **No hook-per-file render test yet.** A few rendered tests exist
  (`use-copy-to-clipboard.test.tsx`, `keyboard-shortcut-hook.test.tsx`)
  but most of the 14 hooks aren't individually covered. The
  barrel-completeness guard fails fast for *missing* hooks; run-time
  correctness of each hook is still the responsibility of the hook's
  own test file. Later Epic 60 prompts should backfill where hooks
  get touched.
