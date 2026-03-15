# Pagination Conventions

Standardized query parameter conventions and response contract for all cursor-paginated list endpoints.

## Response Contract

When `limit` or `cursor` query params are present, the response shape is:

```json
{
  "items": [...],
  "pageInfo": {
    "nextCursor": "eyJjcmVhdGVkQXQiOi...",
    "hasNextPage": true
  }
}
```

**Backward compatibility**: Without pagination params, endpoints return a flat `[...]` array.

## Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int (1–100) | 20 | Page size |
| `cursor` | string | — | Opaque pagination token |
| `q` | string | — | Freetext search (title/name/description) |
| `status` | enum | — | Entity-specific status filter |
| `type` | enum | — | Entity-specific type filter |
| `ownerUserId` | CUID | — | Owner filter (controls, risks) |
| `assigneeUserId` | CUID | — | Assignee filter (tasks) |
| `controlId` | CUID | — | Linked control filter (tasks, evidence) |
| `category` | string | — | Category filter (controls, risks, policies) |
| `criticality` | enum | — | Criticality filter (vendors, assets) |
| `archived` | `true`/`false` | — | Archived filter (evidence) |
| `expiring` | `true`/`false` | — | Expiring soon filter (evidence) |
| `due` | `overdue` / `next7d` / `next30d` | — | Due-date filter (tasks, vendors) |
| `reviewDue` | `overdue` / `next30d` | — | Review due filter (vendors) |
| `includeDeleted` | `true`/`false` | — | Include soft-deleted records (admin only) |

## Endpoint Filter Matrix

| Endpoint | Filters |
|----------|---------|
| `GET /controls` | status, applicability, ownerUserId, q, category |
| `GET /evidence` | type, controlId, q, archived, expiring |
| `GET /risks` | status, category, ownerUserId, q |
| `GET /tasks` | status, type, severity, priority, assigneeUserId, controlId, due, q |
| `GET /policies` | status, category, q |
| `GET /vendors` | status, criticality, riskRating, reviewDue, q |
| `GET /assets` | type, status, criticality, q |

## Cursor Design

- **Payload**: `{ createdAt: ISO-8601, id: CUID }`
- **Encoding**: URL-safe base64 (no `+`, `/`, or `=`)
- **Ordering**: `[{ createdAt: 'desc' }, { id: 'desc' }]` — stable, newest first
- **Strategy**: Fetch `limit + 1` items; extra item signals `hasNextPage`

## Rules

1. **Cursor resets** when any filter changes — do NOT combine a new filter with an old cursor.
2. **Limit is clamped** to `[1, 100]`, default `20`. All route handlers use Zod `z.coerce.number().int().min(1).max(100)`.
3. **URL is the source of truth** for filters on RSC pages — use `searchParams`.
4. **No `useEffect(() => fetch(...))` for core lists** — use server-side data loading via usecases called from RSC page functions.
5. **Stable ordering** — always `createdAt desc, id desc`. Never change ordering within a cursor-paginated session.
