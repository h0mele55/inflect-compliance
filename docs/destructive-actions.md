# Destructive actions — the undo-toast convention

Epic 67 established a single shared pattern for delete / unlink /
remove flows in Inflect. Every new destructive action MUST use it.
This doc is the contract — if you find yourself writing a `confirm()`
dialog or a fire-and-forget DELETE for a destructive flow, you're
inventing a one-off and the review will ask you to convert it.

## Why this pattern

A blocking confirm dialog is the wrong default for routine destruction:

- It punishes accuracy (right-click → delete → confirm × n hits a wall
  every time).
- It still doesn't catch the misclick — once the user reflexively hits
  Enter the dialog "OK"s and the row is gone with no recourse.
- It's modal: the user can't see what happens around the row they're
  about to delete.

The Gmail "undo send" pattern is strictly better for routine cases:

- One click triggers the action; the row visibly disappears.
- A toast with a 5-second countdown lets the user take it back.
- Quiet for the deliberate user, loud enough for the misclicker.
- The actual destructive write is **deferred** until the countdown
  expires, so Undo is real cancellation — not a cosmetic "we'll go
  fetch it back from the trash."

## The canonical wiring

```tsx
import { useToastWithUndo } from '@/components/ui/hooks';

export function MyComponent() {
    const triggerUndoToast = useToastWithUndo();
    // …

    const handleRemove = (id: string) => {
        // 1. Snapshot the visible state.
        const previous = items;

        // 2. Apply optimistic remove so the row vanishes immediately.
        setItems((prev) => prev.filter((x) => x.id !== id));

        // 3. Trigger the toast — this schedules the actual DELETE.
        triggerUndoToast({
            message: 'Item removed',
            undoMessage: 'Undo',
            action: async () => {
                const res = await fetch(`/api/.../items/${id}`, {
                    method: 'DELETE',
                });
                if (!res.ok) throw new Error('Remove failed');
            },
            undoAction: () => setItems(previous),
            onError: () => setItems(previous),
        });
    };
}
```

For TanStack-cached pages the snapshot is the entire query payload
and restore is `queryClient.setQueryData(key, previous)`:

```tsx
const cacheKey = queryKeys.things.detail(tenantSlug, id);
const previous = queryClient.getQueryData<ThingDetailDTO>(cacheKey);

if (previous) {
    queryClient.setQueryData<ThingDetailDTO>(cacheKey, {
        ...previous,
        children: previous.children.filter((c) => c.id !== childId),
    });
}

triggerUndoToast({
    message: 'Child removed',
    undoMessage: 'Undo',
    action: async () => { /* DELETE + invalidate */ },
    undoAction: () => {
        if (previous) queryClient.setQueryData(cacheKey, previous);
    },
    onError: () => {
        if (previous) queryClient.setQueryData(cacheKey, previous);
    },
});
```

## The four invariants

A wired site MUST satisfy all four:

1. **Snapshot before optimistic write.** The snapshot is what undo and
   error paths restore. Snapshot the user's *visible* state — not a
   stale upstream value.

2. **Optimistic remove on click.** The row vanishes immediately. No
   "saving…" spinner, no row-level pending indicator — the toast IS
   the indicator. Consistency across sites is more valuable than any
   bespoke per-row affordance.

3. **DELETE inside `action`, never outside.** The whole point is the
   defer; calling `fetch(..., { method: 'DELETE' })` directly in the
   click handler defeats it. The structural ratchet at
   `tests/guards/epic-67-rollout-coverage.test.ts` enforces this for
   the rolled-out sites.

4. **`undoAction` and `onError` both restore the snapshot.** Same
   restore on undo and on commit failure — the user expects "the row
   came back" to look the same in both cases.

## Message tone

- Past tense, passive voice: `"Risk unlinked"`, `"Document removed"`.
- Domain-specific verbs: `unlinked` for graph edges, `unmapped` for
  framework requirement mappings, `removed` for owned children,
  `deleted` for top-level entities.
- Undo button is always exactly `"Undo"`.

## When NOT to use this pattern

The undo-toast pattern is for **routine, reversible** destructive
actions. It is the wrong tool for:

- **Top-level entity deletion with cascading consequences.** Deleting
  a tenant, an organization, a framework — the cleanup is too
  consequential for a 5-second window. Use a typed-confirmation modal
  ("type the name to delete") instead.
- **Actions that aren't truly reversible by re-creating.** If the
  server-side delete cascades into immutable audit rows or external
  side-effects (email sent, integration token revoked), Undo can't
  put it back. Don't lie to the user with an undo button that wouldn't
  actually undo.
- **Multi-step destructive flows** (e.g. wizard "are you sure?" pages
  that cover multiple downstream effects). Those need a dedicated
  confirmation surface; an undo toast is the wrong primitive.

When in doubt: ask whether the user could click Undo, and have the
state be exactly as it was before the click. If yes, use this pattern.
If no, use a confirmation modal instead.

## Foundation reference

| File | Role |
|---|---|
| `src/components/ui/hooks/use-toast-with-undo.ts` | Hook + module-level pending Map |
| `src/components/ui/undo-toast.tsx` | Visual variant with countdown progress bar + ARIA contract |
| `src/components/ui/hooks/__tests__/use-toast-with-undo.test.ts` | Hook hardening (rapid-fire, unmount, cancel races, sync-throw) |
| `tests/rendered/use-toast-with-undo.test.tsx` | Hook baseline (delay default + custom, undo cancel, concurrent triggers) |
| `tests/rendered/undo-toast.test.tsx` | UI variant tests (countdown, ARIA, keyboard) |
| `tests/rendered/traceability-panel-undo.test.tsx` | Representative integration test for a wired surface |
| `tests/guards/epic-67-rollout-coverage.test.ts` | Structural ratchet — every wired site imports the hook + dispatches via the trigger |

## Adding a new destructive flow

1. Wire the handler using the canonical pattern above.
2. Add the new site to the ratchet at
   `tests/guards/epic-67-rollout-coverage.test.ts::SITE_CONTRACTS`.
3. If the page is the first wired surface for a new domain area,
   add a focused render test alongside `traceability-panel-undo.
   test.tsx` to lock in the optimistic-remove + delayed-commit
   contract for that surface.
