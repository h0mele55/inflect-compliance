# UI Buttons Guide

## Button System Overview

All buttons use the pill-shaped `.btn` CSS system defined in `globals.css`. Sizing tokens are centralized in `src/lib/ui-tokens.ts`.

## Sizes

| Size | CSS | Height | Usage |
|---|---|---|---|
| **Default** | `btn` | ~34px | Standard buttons — headers, toolbars, forms |
| **xs** | `btn btn-xs` | ~28px | Dense table row actions |
| **sm** | `btn btn-sm` | ~32px | Compact panels, dashboard quick actions |
| **lg** | `btn btn-lg` | ~42px | Prominent CTAs, hero sections |

## Variants

| Variant | CSS | Usage |
|---|---|---|
| **Primary** | `btn btn-primary` | Main action (Save, Create, Confirm) |
| **Secondary** | `btn btn-secondary` | Secondary action (Cancel, Back, Filter) |
| **Danger** | `btn btn-danger` | Destructive (Delete, Revoke) |
| **Success** | `btn btn-success` | Positive confirmation |
| **Ghost** | `btn btn-ghost` | Borderless (toolbar toggles) |

## Adding a Button

```tsx
// Simple — use class composition
<button className="btn btn-primary">Save</button>

// With programmatic composition
import { btnClass } from '@/lib/ui-tokens';
<button className={btnClass('primary')}>Save</button>
<button className={btnClass('secondary', 'sm')}>Cancel</button>
```

## Buttons with Icons

Icons go **before** text. Use 14px icon size for default/sm, 12px for xs, 16px for lg:

```tsx
import { AppIcon } from '@/components/icons/AppIcon';

<button className="btn btn-primary">
    <AppIcon name="add" size={14} /> New Control
</button>
```

## Icon-Only Buttons

Use the `IconButton` component — **`aria-label` is required**:

```tsx
import { IconButton } from '@/components/ui/IconButton';

<IconButton icon="edit" aria-label="Edit control" onClick={handleEdit} />
<IconButton icon="error" aria-label="Delete" onClick={handleDelete} variant="danger" btnSize="sm" />
```

## Button Groups

Use `flex gap-2 flex-wrap` for header/toolbar groups. Primary action goes **last** (rightmost):

```tsx
<div className="flex gap-2 flex-wrap">
    <Link href="/dashboard" className="btn btn-secondary">Dashboard</Link>
    <Link href="/new" className="btn btn-primary">+ New Item</Link>
</div>
```

## When to Use Which Size

| Context | Size | Example |
|---|---|---|
| Page header actions | `default` | + New Control, Dashboard |
| Dialog footers | `default` | Cancel / Save |
| Table row actions | `xs` or `btn-sm` | View, Edit |
| Dashboard cards | `sm` | Quick actions |
| Hero/empty state CTA | `lg` | Get Started |

## Links as Buttons

Use `<Link className="btn btn-*">` for navigation. Same pill style applies automatically:

```tsx
<Link href="/controls/new" className="btn btn-primary">+ New Control</Link>
```

## Guardrails

A guardrail test (`tests/guardrails/button-consistency.test.ts`) prevents:
- `<button>` tags with inline `px-` / `py-` / `rounded-` classes (should use `.btn`)
- `text-sm` on `.btn` classes (should use `btn-lg` for larger buttons)

Allowlisted exceptions: `CompactFilterBar.tsx`, `SidebarNav.tsx`, loading/error pages.
