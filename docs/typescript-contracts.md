# TypeScript Contracts Guide

How to add typed endpoints, hooks, and handle pagination/errors.

## Adding a New Endpoint with DTO

### 1. Create Response Schema

Create `src/lib/dto/<entity>.dto.ts`:

```typescript
import { z } from 'zod';
import { UserRefSchema } from './common';

export const WidgetListItemDTOSchema = z.object({
    id: z.string(),
    tenantId: z.string(),
    name: z.string(),
    status: z.string(),
    createdAt: z.string().optional(),
    owner: UserRefSchema.nullable().optional(),
}).passthrough();

export type WidgetListItemDTO = z.infer<typeof WidgetListItemDTOSchema>;
```

**Conventions:**
- Use `.passthrough()` on object schemas (allows extra Prisma fields without breaking)
- Use `z.infer<>` for type derivation (single source of truth)
- Use `.nullable().optional()` for fields that may be null or absent
- Export both the schema and the type

### 2. Add to Barrel Export

In `src/lib/dto/index.ts`:
```typescript
export * from './widget.dto';
```

### 3. Use in Route Handler (optional)

```typescript
import { WidgetListItemDTOSchema } from '@/lib/dto';

export const GET = withApiErrorHandling(async (req, { params }) => {
    const ctx = await getTenantCtx(params, req);
    const widgets = await listWidgets(ctx);
    return NextResponse.json(widgets);
});
```

The response validation happens automatically on the client side via `api-client.ts`
when the hook passes a schema.

## Adding a Typed Hook

### 1. Create Hook File

Create `src/lib/hooks/use-widgets.ts`:

```typescript
'use client';
import { useCallback } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { useApi, useMutation } from './use-api';
import { apiPost, apiDelete } from '@/lib/api-client';
import { WidgetListItemDTOSchema, type WidgetListItemDTO } from '@/lib/dto';
import { z } from 'zod';

const WidgetListSchema = z.array(WidgetListItemDTOSchema);

export function useWidgets() {
    const apiUrl = useTenantApiUrl();
    return useApi<WidgetListItemDTO[]>(apiUrl('/widgets'), WidgetListSchema);
}

export function useCreateWidget() {
    const apiUrl = useTenantApiUrl();
    return useMutation<Record<string, unknown>, WidgetListItemDTO>(
        useCallback((body) => apiPost(apiUrl('/widgets'), body), [apiUrl]),
    );
}
```

### 2. Use in a Page

```typescript
'use client';
import { useWidgets, useCreateWidget } from '@/lib/hooks';

export default function WidgetsPage() {
    const { data: widgets, loading, error, refetch } = useWidgets();
    const { mutate: create, loading: creating } = useCreateWidget();

    const handleCreate = async () => {
        await create({ name: 'New Widget' });
        refetch();
    };

    if (loading) return <div>Loading…</div>;
    if (error) return <div>Error: {error.message}</div>;

    return (
        <ul>
            {widgets?.map(w => <li key={w.id}>{w.name}</li>)}
        </ul>
    );
}
```

## Handling Pagination

Use the `PaginatedResponse<T>` type from `src/lib/dto/common.ts`:

```typescript
import type { PaginatedResponse } from '@/lib/dto';

const { data } = useApi<PaginatedResponse<WidgetListItemDTO>>(url);
// data.items, data.nextCursor, data.total
```

## Error Handling

All hooks throw `ApiClientError` on non-2xx responses:

```typescript
import { ApiClientError } from '@/lib/api-client';

try {
    await create({ name: '' });
} catch (e) {
    if (e instanceof ApiClientError) {
        console.log(e.code);    // 'VALIDATION_ERROR'
        console.log(e.status);  // 400
        console.log(e.details); // Zod validation details
    }
}
```

## Dev-Mode Validation

In `development` and `test` environments, the `api-client` automatically validates
API responses against Zod schemas when hooks pass them. Mismatches are logged
as warnings (never thrown in production).

## CI Guardrails

The following tests prevent backsliding:

| Test | Prevents |
|------|----------|
| `tests/guards/no-unsafe-any.test.ts` | New `useState<any>` in hooks, `as any` in routes |
| `tests/guards/contract-drift.test.ts` | DTO schema structural failures |

To run: `npx jest tests/guards/`
