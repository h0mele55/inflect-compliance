# Filter Query Parameters — Standard Conventions

All list endpoints follow a consistent URL query parameter contract for server-side filtering. This document specifies the standard param names, semantics, and defaults.

## Universal Params

| Param     | Type     | Default  | Description |
|-----------|----------|----------|-------------|
| `q`       | string   | —        | Free-text search. Matches title/name/description (case insensitive). Max 200 chars, trimmed. |
| `status`  | string   | —        | Exact match on status enum (case sensitive to match Prisma enum). |
| `limit`   | integer  | 25       | Page size. Clamped to 1–100. |
| `cursor`  | string   | —        | Opaque cursor for keyset pagination (createdAt-based). |

## Domain-Specific Params

| Param            | Endpoints              | Type    | Description |
|------------------|------------------------|---------|-------------|
| `type`           | tasks, assets, evidence| string  | Entity sub-type filter |
| `severity`       | tasks                  | string  | Task severity (LOW, MEDIUM, HIGH, CRITICAL) |
| `priority`       | tasks                  | string  | Task priority (P1–P4) |
| `assigneeUserId` | tasks                  | string  | Filter by assignee user ID |
| `controlId`      | tasks, tests/plans     | string  | Filter by linked control |
| `due`            | tasks, tests/plans, vendors | enum | Date range: `overdue`, `next7d`, `next30d` |
| `ownerUserId`    | controls, risks        | string  | Filter by owner user ID |
| `applicability`  | controls               | enum    | `APPLICABLE` or `NOT_APPLICABLE` |
| `category`       | controls, risks, policies | string | Category filter |
| `criticality`    | assets, vendors        | string  | Criticality level (LOW–CRITICAL) |
| `scoreMin`       | risks                  | integer | Minimum risk score (inclusive) |
| `scoreMax`       | risks                  | integer | Maximum risk score (inclusive) |
| `riskRating`     | vendors                | string  | Filter by assessment risk rating |
| `reviewDue`      | vendors                | enum    | `overdue` or `next30d` |
| `language`       | policies               | string  | Policy language code (e.g., `en`, `bg`) |
| `includeDeleted` | controls, risks, policies, assets | enum | `true` to include soft-deleted (admin only) |

## Endpoint Reference

### Controls `/api/t/[tenantSlug]/controls`
`q`, `status`, `applicability`, `ownerUserId`, `category`, `includeDeleted`, `limit`, `cursor`

### Evidence `/api/t/[tenantSlug]/evidence`
`q`, `status`, `type`, `controlId`, `limit`, `cursor`

### Tasks `/api/t/[tenantSlug]/tasks`
`q`, `status`, `type`, `severity`, `priority`, `assigneeUserId`, `controlId`, `due`, `linkedEntityType`, `linkedEntityId`, `limit`, `cursor`

### Risks `/api/t/[tenantSlug]/risks`
`q`, `status`, `scoreMin`, `scoreMax`, `category`, `ownerUserId`, `includeDeleted`, `limit`, `cursor`

### Policies `/api/t/[tenantSlug]/policies`
`q`, `status`, `category`, `language`, `includeDeleted`, `limit`, `cursor`

### Assets `/api/t/[tenantSlug]/assets`
`q`, `status`, `type`, `criticality`, `includeDeleted`, `limit`, `cursor`

### Vendors `/api/t/[tenantSlug]/vendors`
`q`, `status`, `criticality`, `riskRating`, `reviewDue`, `limit`, `cursor`

### Test Plans `/api/t/[tenantSlug]/tests/plans`
`q`, `status`, `controlId`, `due`

## Design Rules

1. **URL is source of truth** — filters always reflected in query string
2. **Server-side only** — no client-side `.filter()` on fetched list data
3. **Tenant isolation** — every query includes `tenantId` in `where` clause
4. **Zod validation** — all params validated and normalized before use
5. **`q` length capped** at 200 characters via `normalizeQ()`
6. **Cursor pagination** — keyset-based, not offset-based
7. **Empty filters = no filter** — omitting a param returns all records
8. **Indexes** — composite indexes on `(tenantId, filterField)` for performance
