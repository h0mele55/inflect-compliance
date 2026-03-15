# Filters: How to Add & Maintain

> All list pages use `<CompactFilterBar>` — a compact, horizontal filter bar
> that manages state through URL search params. **Never use stacked `<select>`
> or `<input>` elements for filters.** Guardrail tests enforce this.

## Architecture

```
URL params  ←→  useUrlFilters()  ←→  CompactFilterBar  ←→  User
                     ↓
              React Query fetch  →  Backend (Zod schema + Prisma)
```

- **URL is source of truth** — filters are bookmarkable and survive refresh.
- **Enter-to-search** — the `q` param only updates on Enter, not per-keystroke.
- **Server-side only** — no `.filter()` on the client after `useQuery`.
- **Cursor reset** — `useUrlFilters` deletes `cursor` on every filter change.

## Adding a New Filter

### 1. Backend: Add to Zod Schema

In `src/app/api/t/[tenantSlug]/<entity>/route.ts`:

```typescript
const MyQuerySchema = z.object({
    // existing params...
    myNewParam: z.string().optional(),    // dropdown/chip
    q: z.string().optional().transform(normalizeQ),  // always use normalizeQ
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
}).strip();
```

### 2. Backend: Apply in Prisma Query

Pass the param through to the Prisma `where` clause:

```typescript
const filters = {
    ...existingFilters,
    myNewParam: query.myNewParam,
};
```

### 3. Frontend: Update Config

In `src/components/filters/configs.ts`:

```typescript
export const myPageFilterConfig: CompactFilterBarConfig = {
    searchPlaceholder: 'Search… (Enter)',
    filterKeys: ['q', 'status', 'myNewParam'],  // ← add here
    dropdowns: [
        // existing...
        {
            key: 'myNewParam',
            label: 'My Filter',
            options: [
                { value: 'VALUE_A', label: 'Value A' },
                { value: 'VALUE_B', label: 'Value B' },
            ],
        },
    ],
};
```

### 4. Frontend: Update Page's useUrlFilters

Ensure the page's `useUrlFilters` call includes the new key:

```typescript
const { filters } = useUrlFilters(['q', 'status', 'myNewParam']);
```

## Standard Param Names

| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Text search (normalizeQ: trim, 200 char max) |
| `status` | enum | Status filter |
| `type` | enum | Type/category of entity |
| `severity` | enum | Severity level |
| `category` | string | Category name |
| `criticality` | enum | Criticality level |
| `due` | enum | Due date filter (`overdue`, `next7d`) |
| `reviewDue` | enum | Review due filter (`overdue`, `next30d`) |
| `controlId` | uuid | Filter by linked control |
| `ownerUserId` | uuid | Filter by owner |
| `assigneeUserId` | uuid | Filter by assignee |
| `limit` | int | Page size (1–100, default varies) |
| `cursor` | string | Pagination cursor (auto-managed) |

## CompactFilterBar Features

| Feature | Behavior |
|---------|----------|
| Search | Enter-to-search, clear X button |
| Pill Dropdowns | Click → popover, shows check mark, auto-closes |
| Chip Toggles | Click to toggle, amber when active |
| Clear button | Shows when any filter active, displays count badge when >1 |
| Mobile | Wraps cleanly with `flex-wrap` and `gap-2` |

## Guardrails (enforced by Jest)

- `tests/guardrails/no-client-side-filtering.test.ts`:
  - Fails if list pages contain `.filter()` on query data
  - Fails if list pages use stacked `<select className="input">` elements
  - Fails if list pages don't import `CompactFilterBar`
