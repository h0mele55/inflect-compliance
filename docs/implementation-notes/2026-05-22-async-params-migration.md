# 2026-05-22 — Next 15 async-params migration completed

**Commit:** `<pending> refactor(api): complete the Next 15 async-params migration`

## Design

Next 15+ delivers a route handler's dynamic `params` as a `Promise`.
GAP-05 (2026-04-25) absorbed that change with a **transparent-await
shim** inside `withApiErrorHandling`: the wrapper detected a
Promise-shaped `ctx.params`, awaited it, and forwarded a resolved
object — so the ~250 existing handlers could keep typing `params`
synchronously without per-site churn. Correct, but explicitly
documented as debt; a permanent shim was never the intent.

Roadmap-6 P3 finishes the migration. Every route handler under
`src/app/api` now types `params` as `Promise<{ … }>` and `await`s
it, and the shim is gone.

### The transformation

For a wrapped handler the change is mechanical and regular:

```ts
// before
withApiErrorHandling(async (req, { params }: { params: { id: string } }) => {
    const ctx = await getLegacyCtx(req);
    const x = await getThing(ctx, params.id);

// after
withApiErrorHandling(async (req, { params: paramsPromise }: { params: Promise<{ id: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getLegacyCtx(req);
    const x = await getThing(ctx, params.id);
```

Renaming the destructured binding to `paramsPromise` and binding a
resolved `const params` as the first body statement means **every
downstream `params.x` access — and every `getTenantCtx(params, …)`
call — is left untouched**. Three secondary shapes (the org routes'
`interface RouteContext`, the `RouteParams` type aliases, the two
`start-signin` routes' inline `ctx` type) were migrated the same
way.

### How it was applied — codemods

The transformation is regular enough to codemod. Three passes, each
constrained and idempotent (a migrated signature no longer matches):

1. Single-line `{ params }` destructure signatures.
2. Multi-line signatures (trailing-comma param lists).
3. Multi-line *destructures* and `interface`/`type` param fields.

A fourth, file-listed pass handled the org `RouteContext` interface
pattern (`routeCtx.params` → `(await routeCtx.params)`). `tsc` is
the safety net: a handler the codemod missed keeps a sync `params`
type — which, once the shim is removed, fails typecheck the moment
it reads `params.x` off a `Promise`. The completion was verified by
a tree scan: zero `params: {` sync annotations remain.

### Retiring the shim

With every handler resolving its own `params`, the transparent-await
block in `withApiErrorHandling` is dead code and was removed. Unit
tests that pass a plain sync `params` object still pass — `await` on
a non-thenable resolves to itself — so the wrapper stays callable
both ways without the shim.

## Files

| Area | Role |
|------|------|
| `src/app/api/**/route.ts` (≈250 files) | every handler retyped `params: Promise<…>` + `await` |
| `src/lib/errors/api.ts` | transparent-await shim block removed from `withApiErrorHandling` |
| `tests/unit/*route*.test.ts` (10 files) | call sites updated to `params: Promise.resolve({ … })` |
| `tests/guards/async-params-route-typing.test.ts` | NEW — ratchet: fails CI on any new sync-typed `params` |

## Decisions

- **Rename the binding, don't rewrite the body.** Binding
  `const params = await paramsPromise` once, at the top of the
  handler, keeps the diff to three lines per handler and leaves
  every `params.x` / `getTenantCtx(params, …)` site identical —
  maximally reviewable across 320 files.

- **Codemod, with typecheck as the net.** A codemod cannot prove it
  reached every handler — but it does not need to. A missed handler
  keeps a sync `params` type; with the shim removed, that is a hard
  `tsc` error, not a silent runtime bug. The migration is therefore
  safe to automate.

- **Remove the shim now, not later.** The prompt's "clear completion
  path" is the shim's removal. Leaving it would re-normalise the
  workaround; the new ratchet guarantees no handler can depend on it
  again.

- **`(await routeCtx.params)` for the org routes.** The handful of
  org routes read `params` through a named `RouteContext` interface.
  Inlining `(await routeCtx.params)` at each access is scope-free —
  correct regardless of handler count — and awaiting an already
  -settled promise twice is free.
