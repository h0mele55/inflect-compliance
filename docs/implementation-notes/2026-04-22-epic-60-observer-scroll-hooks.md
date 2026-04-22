# 2026-04-22 — Epic 60 viewport/observer/scroll hook cluster

**Commit:** `5a38b80 feat(epic-60): harden viewport/observer/scroll hook cluster`

Second pass on Epic 60: harden the five browser-observation hooks
(`useIntersectionObserver`, `useInViewport`, `useResizeObserver`,
`useScroll`, `useScrollProgress`) to production-grade and give them
proper test coverage. The hook files already existed — this pass
sharpens each one against the prompt's non-negotiables (SSR safety,
cleanup, no leaks, generic API).

## Design

Each hook follows the same shape:

```
┌─ caller passes a React ref to the observed element ─┐
│                                                     │
│  useEffect (client-only):                           │
│    ├─ SSR guard: typeof window === 'undefined' → noop
│    ├─ API-availability guard: typeof X === 'undefined' → noop
│    ├─ ref.current null → noop                       │
│    ├─ set up observer / listener                    │
│    └─ return () => cleanup (disconnect / remove)   │
│                                                     │
└─ returns typed state (entry / boolean / progress) ─┘
```

## Hooks and APIs

| Hook | Signature | Returns |
|---|---|---|
| `useIntersectionObserver` | `(ref, { threshold?, root?, rootMargin?, freezeOnceVisible? })` | `IntersectionObserverEntry \| undefined` |
| `useInViewport` | `(ref, { root?, defaultValue? })` | `boolean` |
| `useResizeObserver` | `(ref)` | `ResizeObserverEntry \| undefined` |
| `useScroll` | `(threshold, { container? })` | `boolean` — true while scroll position > threshold |
| `useScrollProgress` | `(ref, { direction? })` | `{ scrollProgress: number, updateScrollProgress: () => void }` |

All five exported from the `@/components/ui/hooks` barrel (Epic 60
canonical home).

## Files

| File | Change |
|---|---|
| `src/components/ui/hooks/use-intersection-observer.ts` | SSR guard + `IntersectionObserver`-availability check; moved callback into the effect for exhaustive-deps; dropped `JSON.stringify(threshold)` hack; added full JSDoc |
| `src/components/ui/hooks/use-in-viewport.tsx` | Dropped the redundant `scroll`+`resize` listeners + per-event `getBoundingClientRect()`; now a thin IO-only wrapper; removed unnecessary `'use client'` per the conventions doc; SSR guard added |
| `src/components/ui/hooks/use-resize-observer.ts` | SSR + `ResizeObserver`-availability guard; inlined the callback; JSDoc |
| `src/components/ui/hooks/use-scroll.ts` | Fixed stale `container` dep in the callback; collapsed two useEffects into one; passive listener; SSR guard; JSDoc describing the sticky-header use case |
| `src/components/ui/hooks/use-scroll-progress.ts` | Clamp progress to `[0, 1]` (not just cap at 1 — handles negative overscroll on iOS); JSDoc documenting the manual `onScroll` wiring contract (existing consumers rely on it) |
| `tests/rendered/observer-scroll-hooks.test.tsx` | **new** — 18 tests, one suite per hook plus a full-tree smoke render that asserts every observer disconnects on unmount |

Existing consumers (`ScrollContainer`, `FilterScroll`, `AnimatedSizeContainer`)
unchanged — preserved public APIs of every hook. The
`useScrollProgress` return shape `{ scrollProgress, updateScrollProgress }`
stayed exactly the same.

## Cleanup / safety decisions

- **Single cleanup pattern across all five hooks**: effect returns a
  disconnect / remove-listener function. Render-time mounts and
  cleanups are balanced 1-to-1, verified by the smoke-render test
  which asserts every observer's `disconnected` flag is `true`
  post-unmount.
- **Double guard on browser globals**: `typeof window === 'undefined'`
  AND `typeof X === 'undefined'` for the specific constructor. The
  first catches SSR; the second catches jsdom or older browsers that
  lack the API. Hook returns its documented default without throwing.
- **`useInViewport` architectural simplification**: removed the hybrid
  "IO + manual scroll/resize listener + `getBoundingClientRect()` on
  every event" pattern. IO already reacts to scroll + resize inside
  its root. The old implementation was doing the same work twice, and
  the per-event rect reads triggered layout thrashing on scroll.
  Observable behaviour unchanged; no consumer needed a code change.
- **`useScroll` passive listener**: `addEventListener('scroll', ..., { passive: true })`
  so the browser can optimise scroll handling. Combined with React's
  same-value-setState bail-out, fast scrolls don't force a re-render
  on every pixel — only at threshold crossings.
- **`useScrollProgress` manual-wiring contract is now documented**:
  the hook deliberately does NOT register its own scroll listener —
  the consumer wires `onScroll={updateScrollProgress}` on the scroll
  element itself, which keeps the listener local and stays in sync
  with the ref's mount/unmount. Auto-recomputes on resize via the
  internal `useResizeObserver`. Edge cases (empty container, negative
  overscroll, unmounted ref) all handled with explicit branches.
- **`threshold` array identity**: `useIntersectionObserver` previously
  called `JSON.stringify(threshold)` in the effect deps to stabilise
  array identity. That masked real changes. Dropped; callers passing
  `threshold: [0.25, 0.5, 0.75]` inline must memoise it themselves,
  matching React's normal dep-array contract. Documented in the JSDoc.

## Decisions

- **No new hooks, no moves.** Every change stayed within an existing
  file; no barrel entry added or removed; no consumer touched. Lowest
  possible churn for a hardening pass.
- **Manual-wiring stays in `useScrollProgress`**. The auto-listener
  alternative would break the two existing consumers (`ScrollContainer`,
  `FilterScroll`) that wire `onScroll={updateScrollProgress}` directly
  on the element. The manual approach also avoids document-level
  listener bubbling and stays cleaner with React's ref lifecycle.
- **Test harness uses observer stubs, not polyfills.** Installing
  `MockIntersectionObserver` + `MockResizeObserver` on `globalThis`
  before each test is cheaper than pulling in a polyfill and gives the
  tests a `trigger()` helper to synthesise observer callbacks. The
  stubs also record `disconnected` so cleanup assertions are explicit.

## Remaining non-blocking caveats

- **No render test for the three existing consumers** (`ScrollContainer`,
  `FilterScroll`, `AnimatedSizeContainer`). Their hooks are now covered
  individually; the components around them weren't touched and have
  their own test files (where they exist). Acceptable for a hook-
  focused hardening pass.
- **Upstream `useScroll` consumers: zero today.** The hook has no
  call sites in the app yet — it's ready for sticky-header rollouts
  in later Epic 60 prompts. The hook tests exercise it end-to-end
  anyway so future consumers start from a proven baseline.
