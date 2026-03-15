# RSC Guidelines

> **Rule**: pages under `/t/[tenantSlug]/(app)/` are **React Server Components by default**.
> Only add `'use client'` when the component needs browser APIs, event handlers, or React hooks.

---

## 1. Page Structure

Every read-heavy route follows this pattern:

```
dashboard/
  page.tsx          ← async Server Component (data loader + render)
  loading.tsx       ← skeleton shown during server render via Suspense
  SomethingClient.tsx  ← client island (only if needed)
```

### Server Component page (`page.tsx`)

```tsx
import { getTenantCtx } from '@/app-layer/context';
import { getSomething } from '@/app-layer/usecases/something';

export const dynamic = 'force-dynamic';

export default async function SomethingPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx(tenantSlug);
    const data = await getSomething(ctx);
    return <div>{/* render data */}</div>;
}
```

**Key rules:**
- Call app-layer usecases directly — **never** `fetch('/api/...')` from a server component.
- Use `getTranslations` from `next-intl/server` (not `useTranslations`).
- Use `Link` from `next/link` for navigation (it works in RSC).
- Add `export const dynamic = 'force-dynamic'` since we need tenant context.

---

## 2. Client Islands

When a page has interactive parts (forms, dropdowns, file uploads), extract them into a `'use client'` component:

```tsx
// SomethingClient.tsx
'use client';
import { useState } from 'react';

interface SomethingClientProps {
    initialData: SomethingDTO[];
    tenantSlug: string;
}

export function SomethingClient({ initialData, tenantSlug }: SomethingClientProps) {
    const [data, setData] = useState(initialData);
    // interactive logic here
}
```

**Rules:**
- Pass **serializable data** from RSC → client island via props. Use `JSON.parse(JSON.stringify(data))` if needed.
- Keep client islands **minimal** — only the interactive portion.
- Client islands may `fetch('/api/...')` for mutations (POST, PATCH, DELETE) since those are user-triggered.
- Do **not** `useEffect + fetch` for initial data loading — that data comes from the RSC wrapper.

---

## 3. DTO Types

Define shared prop types inline or in a `types.ts` co-located with the page:

```tsx
// Types shared between RSC wrapper and client island
interface EvidenceDTO {
    id: string;
    title: string;
    status: string;
    // ... serializable fields only
}
```

**Do not** pass Prisma models directly — always map to plain objects.

---

## 4. Loading States (`loading.tsx`)

Every RSC route should have a `loading.tsx` that Next.js shows automatically via Suspense:

```tsx
export default function Loading() {
    return (
        <div className="animate-pulse space-y-4 p-6">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
        </div>
    );
}
```

---

## 5. Anti-Patterns (will break CI)

| ❌ Don't | ✅ Do |
|----------|-------|
| `'use client'` on a read-heavy page | Keep page.tsx as RSC, extract client island |
| `useEffect(() => fetch('/api/...'))` for initial data | Fetch server-side in RSC via usecases |
| `import prisma` in a page file | Call usecases which call repositories |
| `useTranslations()` in RSC | `getTranslations()` from `next-intl/server` |
| `fetch('/api/t/${slug}/...')` in RSC | Call usecases directly |

---

## 6. Guardrail Tests

Two Jest tests enforce these conventions:

- **`rsc-regression.test.ts`**: Fails if any RSC page contains `'use client'`.
- **`rsc-regression.test.ts`**: Fails if any RSC page uses `useEffect` + `fetch('/api/` pattern.

Adding a new RSC page? Add its directory to `RSC_PAGES` in the test file.
