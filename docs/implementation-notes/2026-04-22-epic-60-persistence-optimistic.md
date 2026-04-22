# 2026-04-22 — Epic 60 persistence + optimistic-state hook layer

**Commit:** _(stamped post-commit)_

Hardens the Epic 60 `useLocalStorage` and `useOptimisticUpdate` hooks
into production-grade primitives: hydration-safe, typed, SSR-guarded,
and decoupled from any specific data-fetching library. Zero consumer
churn — `useLocalStorage`'s one internal consumer (`useColumnVisibility`)
keeps the same `[value, setValue]` tuple; `useOptimisticUpdate` has no
production consumers, so its API is free to change.

## Design

### `useLocalStorage`

```
Before                                  After
──────                                  ─────
useState(getItemFromStorage(k) ?? v)    useState(initialValue)
  → SSR returns v, client returns        → server + client agree on
    storage value → hydration                first render. hydrate
    mismatch warning, discarded              effect reads storage
    client render                            AFTER mount.

JSON.parse raw → throws on bad          try { JSON.parse(raw) }
  payload, brings the whole tree          catch { fallback to
  down                                      initialValue }

setValue(value) only, no functional     setValue(value | (prev) => next),
  form — two quick updates can            functional form reads the
  clobber each other                       freshest state.

setValue writes to window.localStorage  setValue guards with
  unconditionally → crashes in SSR        `typeof window !== 'undefined'`
  preview paths that run setters           + try/catch for quota errors
  during module init                      + private-mode failures.

No cross-tab sync → two open tabs       `storage` event listener
  drift until reload                      re-hydrates on same-origin
                                          writes from other tabs.
                                          syncAcrossTabs=false escape
                                          hatch for hot-path callers.

No serializer override → Date, BigInt,  options: {
  Map all round-trip badly                serialize: (v: T) => string,
                                          deserialize: (raw) => T
                                        } — defaults to JSON.
```

Return signature kept as `[T, Dispatch<SetStateAction<T>>]` so existing
call sites (and `useState` muscle memory) keep working.

### `useOptimisticUpdate`

Before: a thin wrapper around `useSWR` + `@dub/utils` fetcher + `sonner`
`toast.promise`. Three library dependencies baked in; the signature
(`url: string, toastCopy?`) only makes sense if you're fetching via SWR.
Our codebase mixes SWR and React Query, so the hook only worked for
half the app.

After: framework-agnostic state orchestrator. Accepts a `value` (the
committed source of truth) and returns `{ value, isPending, update }`.
The caller drives the mutation inside `commit` and is responsible for
refetching. No SWR dep, no `@dub/utils` dep, no toast dep.

```
// Caller using React Query
const { data: risk } = useQuery(...);
const { value, isPending, update } = useOptimisticUpdate(risk);

async function markRemediated() {
  await update({ ...value, status: 'remediated' }, async () => {
    await mutateAsync(...);
    await queryClient.invalidateQueries(...);
    // query refetch lands → `risk` reference changes → overlay clears
  });
}

// Caller using SWR
const { data, mutate } = useSWR('/api/...');
const { value, update } = useOptimisticUpdate(data);

await update(optimistic, async () => {
  await fetch('/api/...', { method: 'PATCH', body });
  await mutate(); // SWR refetch → `data` reference changes → overlay clears
});
```

#### Overlay-until-value-changes (not overlay-until-success)

When `commit` resolves, the caller's data layer may not have the fresh
value yet — a React Query invalidation fires the refetch async. Clearing
the overlay on commit success would briefly flash the old value until
the refetch lands. Instead, the overlay stays until the `value` prop's
reference changes (via a `useEffect([value])`), giving the caller's
refetch time to propagate cleanly.

Tradeoff: if the caller never refetches, the overlay persists for the
session. That's a caller bug, but visually consistent with what the
user expects ("the value I just set is still shown").

## Files

| File | Change |
|---|---|
| `src/components/ui/hooks/use-local-storage.ts` | Rewritten: hydration-safe init, storage-event sync, JSON safety, functional updater, custom serializer option, SSR-guarded setter |
| `src/components/ui/hooks/use-optimistic-update.ts` | Rewritten: framework-agnostic `(value, { onError? }) → { value, isPending, update }`; dropped SWR + `@dub/utils` + toast dependencies |
| `src/components/ui/hooks/index.ts` | Barrel exports new option / result types |
| `src/components/ui/hooks/README.md` | Optimistic UI row updated to reflect the new API surface |
| `tests/rendered/persistence-optimistic-hooks.test.tsx` | **new** — 16 tests covering hydration, storage events, serializers, quota failure, optimistic overlay lifecycle, rollback on throw, concurrent pending tracking |

## Decisions

- **Hydration-safe by putting `initialValue` in `useState`, not the
  storage read.** The alternative — reading storage synchronously and
  using `useSyncExternalStore` — is heavier, requires a subscribe /
  getSnapshot / getServerSnapshot triple, and gains nothing for our
  use cases (no concurrent-mode tearing risk in practice). The
  `useState(initial) + useEffect(hydrate)` idiom is the pattern React
  docs recommend for this exact case.

- **Keep `[value, setValue]` tuple return shape.** One internal
  consumer (`useColumnVisibility`) already destructures it that way,
  and the tuple matches `useState` so consumers don't need to remember
  a different shape for the persisted variant. An object-shaped return
  would have meant a migration pass for zero benefit.

- **Cross-tab sync default ON.** Two tabs open against the same
  dashboard and drifting column-visibility preferences is the exact
  scenario this hook exists to smooth over. The listener is cheap
  (one global listener per hook instance) and the escape hatch
  (`syncAcrossTabs: false`) is there for callers with a specific reason
  to opt out.

- **Overlay keyed on `value` reference identity, not structural
  equality.** If the caller's fetcher produces a new object on every
  render (React Query doesn't, SWR doesn't, but some hand-rolled
  fetchers do), the effect would fire constantly and clear the overlay
  prematurely. This is a caller bug — the fetcher should memoise — and
  catching it with a deep-equality check would hide the bug rather than
  fix it.

- **`update` returns the commit's promise.** Callers can `await
  update(...)` and chain `.then()` for post-commit follow-ups (toast,
  navigation, telemetry). Not returning the promise would force callers
  into `useEffect([isPending])` gymnastics for the same thing.

- **`isPending` is a count-based boolean, not a
  boolean-that-last-commit-toggles.** Concurrent `update` calls are
  rare, but when they happen, `isPending` should stay true until *all*
  commits resolve. A plain boolean that each commit's `finally` flipped
  would race: first commit resolves → sets false → second commit is
  still in flight → stale false.

## Caveats

- **Concurrent-commit rollback semantics.** If two commits are in
  flight, the second's overlay wins. If the first then fails, we
  rollback to the pre-optimistic `value` — losing the second's
  optimistic state even though its commit hasn't failed. Callers with
  parallel-mutation use cases should disable the control while
  `isPending` is true. Documented in the hook's JSDoc.

- **Cross-tab storage listener is same-origin only.** Browsers correctly
  scope the `storage` event to the origin writing it, so this is not a
  privacy / security concern — just a reminder that two different
  subdomains won't sync via this mechanism.

- **`localStorage` write failures are silent.** A quota exceeded or
  Safari-private-mode throw is swallowed so the in-memory state still
  updates. An operator doesn't see this unless they instrument their
  own writes separately. For the preferences use case (column
  visibility, column order, theme toggle), silent-degrade is the right
  default: losing persistence is better than a crashed dashboard.

## Follow-ups (not blocking)

- `useColumnVisibility`'s single-table branch uses `Object.fromEntries`
  in the render body, re-computing `defaultState` every render. Moving
  it behind a `useMemo` would be a drive-by perf win. Out of scope for
  this prompt.

- `@dub/utils` remains a project-wide dependency — 81 files still
  import from it. This prompt only detached one hook; a broader
  `@dub/utils` removal pass is its own project.
