# Keyboard shortcuts & Command Palette — contributor guide

Epic 57. This is the short, practical answer to "how do I wire a
keyboard shortcut into Inflect?" — if your question isn't answered
here, the canonical code is in
[`src/lib/hooks/use-keyboard-shortcut.tsx`](../src/lib/hooks/use-keyboard-shortcut.tsx)
and [`src/components/command-palette/`](../src/components/command-palette/).

---

## TL;DR

- **Register shortcuts via `useKeyboardShortcut`** — never
  `document.addEventListener('keydown', …)`.
- **Always supply a `description`** — it's what the command palette
  surfaces to users.
- **Pick a scope and a priority tier** (see table below). Default
  priorities (0 and 1) are usually enough; anything ≥ 100 is reserved.
- **Don't add a shortcut if the action is destructive or
  permission-gated.** Dangerous actions belong behind confirmation UI.
- **Respect text inputs.** The hook already blocks shortcuts in
  editable targets by default — don't override unless you have to.

---

## Registering a shortcut

```tsx
import { useKeyboardShortcut } from '@/lib/hooks/use-keyboard-shortcut';

function FilterTrigger() {
  const [open, setOpen] = useState(false);

  useKeyboardShortcut('f', () => setOpen(true), {
    enabled: !open,
    scope: 'global',
    description: 'Open filters',
  });
  …
}
```

### Keys

Plain keys: `'f'`, `'Enter'`, `'Escape'`, `'ArrowUp'`, `'?'`.
Modifiers (any order, `+`-separated): `'mod+k'`, `'shift+?'`,
`'ctrl+Enter'`, `'meta+alt+p'`. The token **`mod`** resolves to `meta`
on macOS and `ctrl` everywhere else — prefer it for invocation
shortcuts.

Pass an array to bind several keys to the same handler:

```tsx
useKeyboardShortcut(['Escape', 'q'], close, { description: 'Close' });
```

### Options you will actually use

| Option | Default | When to set |
|---|---|---|
| `enabled` | `true` | Gate on local state (`!isOpen`, `selectedCount > 0`). Cheaper than unmounting. |
| `priority` | `0` | See priority tiers below. |
| `scope` | `'global'` | Use `'overlay'` when the shortcut must fire *only* while an overlay (modal, sheet, drawer) is open. |
| `allowWhenOverlayOpen` | `false` | Set `true` *only* for shortcuts that must work both on a bare page and on top of an overlay (the command palette is the canonical example). |
| `allowInInputs` | `false` | Set `true` when the shortcut is about invoking a productivity affordance (e.g. `⌘K`) that should work even while typing. |
| `preventDefault` | `true` | Leave on unless you need browser default behaviour. |
| `description` | — | **Always provide one.** Surfaced by the command palette. |

`modal: true` / `sheet: true` are legacy aliases — they map to
`scope: 'overlay'`. New code should pass `scope` directly.

---

## Priority tiers

Only one handler fires per keystroke — the one with the highest
priority wins, with registration order (LIFO) breaking ties. Pick the
smallest tier that correctly expresses intent; headroom is finite.

| Tier | Example | Meaning |
|---|---|---|
| `0` | default | Ordinary page or component binding |
| `1` | filter-list clear | Broad list affordance |
| `2` | selection-toolbar clear | Narrower — wins over `1` when both match |
| `5` | mobile drawer close, date-range preset | Overlay-scoped; wins over global bindings while mounted |
| `100` | command palette `mod+k` | Reserved for invocations that must *never* be shadowed |

Do **not** reach for `priority: 100` for your feature — that slot is
the palette. If you think you need it, talk to the platform team.

---

## Scope rules (precedence)

The registry resolves competing bindings in this order:

1. **Input-target guard.** If the event target is editable
   (`INPUT`, `TEXTAREA`, `SELECT`, `contenteditable`, or
   `role="textbox" | "combobox" | "searchbox"`), only shortcuts with
   `allowInInputs: true` are considered. Everything else stands down.
2. **Overlay detector.** An overlay is open when the registry
   finds any element matching:
   - `[role="dialog"][data-state="open"]` (Radix Dialog)
   - `[data-vaul-drawer][data-state="open"]` (Vaul Drawer)
   - `[data-sheet-overlay]` (app-level sheets, mobile nav drawer)
   - `[data-modal-overlay]` (legacy modal marker)
3. **Scope filter.**
   - `scope: 'global'` shortcuts are skipped while an overlay is
     open, unless they opted in via `allowWhenOverlayOpen: true`.
   - `scope: 'overlay'` shortcuts are skipped while *no* overlay is
     open.
4. **Priority tie-break.** Higher priority wins; same priority →
   most-recently-registered wins.

Radix Dialog / Vaul Drawer handle their own Escape internally — our
registry never routes Escape into them. Overlay-close is therefore
correct by default, and our Escape bindings for filter-clear and
selection-clear naturally stand down while one of those is open.

---

## The command palette (`⌘K` / `Ctrl+K`)

- Mounted once at the app shell in `src/app/providers.tsx`.
- Registers `mod+k` at priority 100 with `allowInInputs: true` and
  `allowWhenOverlayOpen: true` — it opens from anywhere, including
  mid-typing and on top of a modal.
- Lists every registered shortcut by its `description` (filtered out
  from its own listing) so the palette doubles as shortcut-discovery
  when the user hasn't started typing.
- Surfaces navigation and action commands via
  [`use-palette-commands.ts`](../src/components/command-palette/use-palette-commands.ts).
  Add a new Navigation entry there; *do not* invent a separate
  registry.

### When to add a palette command

**Add it** if it's a:

- Navigation destination that's already in the sidebar
- Universal, safe action (theme toggle, sign out)

**Don't add it** if it's:

- Destructive (delete, archive, publish, role changes)
- Permission-gated (administrative toggles without a confirmation UX)
- Entity-specific — the palette already exposes entity detail pages
  via the search surface; don't duplicate

---

## When NOT to add a shortcut

- **Destructive or irreversible actions.** Delete, overwrite, publish,
  finalize, sign, approve. These need an explicit confirmation UX.
- **Per-entity actions.** Use a row menu or a detail-page button,
  not a global keybinding that depends on which entity the user is
  "currently looking at".
- **Shortcuts that conflict with the platform.** `mod+a` (select
  all), `mod+f` (browser find), `mod+c` / `mod+v` (copy/paste),
  `mod+s` (save), `mod+z` / `mod+shift+z` (undo/redo).
- **One-off keys that compete with the global set.** Every raw
  letter you claim at `scope: 'global'` means a user typing that
  letter in a list-page search box expects normal behaviour — the
  hook's input-target guard handles that, but the shortcut still
  competes with any user habit from another app.

---

## Audit + enforcement

- `tests/guardrails/keyboard-shortcut-conventions.test.ts` statically
  checks that every `useKeyboardShortcut` call site in `src/` carries
  a `description`, and blocks any new `document.addEventListener('keydown')`
  outside the hook module.
- `tests/unit/keyboard-shortcut-provider-integration.test.ts` locks
  the provider ordering at the app shell.
- `tests/rendered/` contains behaviour tests for the hook, the
  palette, entity search, and the core F + Escape bindings.

If you find yourself about to bypass any of these, stop and check
that the hook can express what you need — nine times out of ten it
already does.
