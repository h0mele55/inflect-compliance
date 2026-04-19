# Design System Guide

## Token Foundation

All UI styling targets semantic CSS custom properties defined in `src/styles/tokens.css`, mapped to Tailwind utilities in `tailwind.config.js`.

### Token Categories

| Category | CSS Variable | Tailwind Class | Usage |
|---|---|---|---|
| **Surfaces** | `--bg-default` | `bg-bg-default` | Cards, panels, modals |
| | `--bg-muted` | `bg-bg-muted` | Hover states, active surfaces |
| | `--bg-subtle` | `bg-bg-subtle` | Selection backgrounds, disabled |
| | `--bg-elevated` | `bg-bg-elevated` | Tooltips, dropdowns |
| | `--bg-page` | `bg-bg-page` | Page background |
| **Text** | `--content-emphasis` | `text-content-emphasis` | Headings, bold labels |
| | `--content-default` | `text-content-default` | Body text, table cells |
| | `--content-muted` | `text-content-muted` | Secondary text, placeholders |
| | `--content-subtle` | `text-content-subtle` | Disabled text, hints |
| **Borders** | `--border-default` | `border-border-default` | Standard borders |
| | `--border-subtle` | `border-border-subtle` | Soft dividers, card edges |
| | `--border-emphasis` | `border-border-emphasis` | Focused inputs |
| **Status** | `--bg-success` / `--content-success` / `--border-success` | `bg-bg-success` etc. | Success states |
| | `--bg-warning` / `--content-warning` / `--border-warning` | `bg-bg-warning` etc. | Warning states |
| | `--bg-error` / `--content-error` / `--border-error` | `bg-bg-error` etc. | Error/danger states |
| | `--bg-info` / `--content-info` / `--border-info` | `bg-bg-info` etc. | Informational states |
| | `--bg-attention` / `--content-attention` / `--border-attention` | `bg-bg-attention` etc. | Pending/needs-action |
| **Brand** | `--brand-default` | Direct or `brand-500` | Brand accent |

### Forbidden Patterns

Never use raw Tailwind color scales in migrated pages:

```tsx
// BAD — hardcoded colors break theming
<p className="text-slate-400">Muted text</p>
<div className="bg-slate-800 border-slate-700">Card</div>

// GOOD — semantic tokens
<p className="text-content-muted">Muted text</p>
<div className="bg-bg-default border-border-default">Card</div>
```

## Button Component

`src/components/ui/button.tsx` — the primary button primitive.

### Variants

| Variant | Usage | Key Tokens |
|---|---|---|
| `primary` | Main action (Save, Create) | `bg-brand-600`, `text-white` |
| `secondary` | Secondary action (Cancel, Back) | `bg-bg-default`, `border-border-subtle` |
| `outline` | Tertiary action | `border-border-subtle`, `bg-transparent` |
| `ghost` | Borderless (toolbar toggles) | `hover:bg-bg-muted` |
| `danger` | Destructive (Delete, Revoke) | `bg-red-600` |
| `danger-outline` | Soft destructive | `border-red-500/50`, `text-content-error` |
| `success` | Positive confirmation | `bg-emerald-600` |

### Sizes

| Size | Class | Height |
|---|---|---|
| `xs` | `h-7 text-xs` | 28px |
| `sm` | `h-8 text-xs` | 32px |
| `md` | `h-9 text-sm` | 36px |
| `lg` | `h-10 text-sm` | 40px |

### Usage

```tsx
import { Button, buttonVariants } from '@/components/ui/button';

// Interactive button
<Button variant="primary" onClick={save} loading={saving}>Save</Button>

// Button with icon
<Button variant="secondary" icon={<Filter className="size-4" />}>Filters</Button>

// Disabled with tooltip
<Button variant="primary" disabledTooltip="You need admin access">Delete</Button>

// Link styled as button (use buttonVariants)
import { cn } from '@dub/utils';
<Link href="/new" className={cn(buttonVariants({ variant: 'primary', size: 'md' }))}>
    + New Item
</Link>
```

### When to Use `Button` vs `buttonVariants`

| Scenario | Use |
|---|---|
| Clickable `<button>` element | `<Button>` component |
| `<Link>` styled as a button | `buttonVariants()` + `cn()` |
| Server component with navigation | `buttonVariants()` (no hooks needed) |
| Button with loading/disabled state | `<Button>` component |

## StatusBadge Component

`src/components/ui/status-badge.tsx` — semantic status indicator.

### Variants

| Variant | Usage | Tokens |
|---|---|---|
| `neutral` | Default, inactive | `bg-bg-subtle`, `text-content-muted` |
| `info` | Informational | `bg-bg-info`, `text-content-info` |
| `success` | Active, complete | `bg-bg-success`, `text-content-success` |
| `pending` | Needs action | `bg-bg-attention`, `text-content-attention` |
| `warning` | Caution | `bg-bg-warning`, `text-content-warning` |
| `error` | Error, critical | `bg-bg-error`, `text-content-error` |

### Usage

```tsx
import { StatusBadge, statusBadgeVariants } from '@/components/ui/status-badge';

// Standard badge
<StatusBadge variant="success">Active</StatusBadge>

// Without icon
<StatusBadge variant="warning" icon={null}>Pending</StatusBadge>

// With tooltip
<StatusBadge variant="error" tooltip="3 critical findings">Critical</StatusBadge>

// Clickable badge (use statusBadgeVariants on a <button>)
<button className={cn(statusBadgeVariants({ variant: 'info' }), 'cursor-pointer')}>
    Admin
</button>
```

### Variant Mapping Pattern

```tsx
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
    ACTIVE: 'success',
    PENDING: 'warning',
    FAILED: 'error',
    INACTIVE: 'neutral',
};

<StatusBadge variant={STATUS_VARIANT[item.status] || 'neutral'} icon={null}>
    {item.status}
</StatusBadge>
```

## EmptyState Component

`src/components/ui/empty-state.tsx` — empty/missing content layout.

```tsx
import { EmptyState } from '@/components/ui/empty-state';
import { Search, Building2 } from 'lucide-react';

// Basic
<EmptyState icon={Building2} title="No vendors found" description="Add your first vendor to get started." />

// With CTA
<EmptyState icon={Building2} title="No vendors found" description="Get started by adding a vendor.">
    <Button variant="primary">+ Add Vendor</Button>
</EmptyState>

// Filtered empty state
<EmptyState icon={Search} title="No results" description="Try adjusting your filters." />
```

## Legacy System (Deprecating)

The old `.btn .btn-primary` and `.badge .badge-success` CSS classes in `globals.css` are **deprecated**. They remain for ~40 unmigrated pages. New pages must use the component primitives above.

### Migration Checklist

When migrating a page to the design system:

1. Replace `className="btn btn-*"` with `<Button>` or `buttonVariants()`
2. Replace `className="badge badge-*"` with `<StatusBadge>` or `statusBadgeVariants()`
3. Replace raw Tailwind colors (`text-slate-*`, `bg-slate-*`, `border-slate-*`) with semantic tokens
4. Replace empty-table markup with `<EmptyState>`
5. Add the page to `MIGRATED_PAGES` in `tests/guardrails/design-system-drift.test.ts`
6. Add assertions in `tests/guardrails/token-migration.test.ts`

## Guardrails

| Test File | What It Catches |
|---|---|
| `token-css-integrity.test.ts` | Missing CSS variables referenced by tailwind.config.js |
| `cva-primitives.test.ts` | Primitive API surface, semantic token usage, no raw colors |
| `token-migration.test.ts` | Migrated pages import and use the correct primitives |
| `design-system-drift.test.ts` | Raw colors reappearing in migrated pages, duplicate components |
| `button-consistency.test.ts` | Ad-hoc inline button styling in page files |
