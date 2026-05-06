-- ═══════════════════════════════════════════════════════════════════
-- PR-4 — List-page index audit
-- ═══════════════════════════════════════════════════════════════════
--
-- Walked every list-page query path landed in PR-1..PR-3 and verified
-- a covering composite index exists on the tenant-scoped table for
-- each `WHERE + ORDER BY` shape. Three gaps surfaced — all of them on
-- entities whose unfiltered list page sorts on a column not yet
-- indexed in tandem with `tenantId`. Without these indexes the planner
-- falls back to a bitmap scan + sort, fine on small datasets but
-- O(n log n) per request as tenants accumulate rows.
--
-- The complete inventory across all 7 list-page repos:
--
--   Control:   list ORDER BY [code, annexId]   covered by (tenantId, code)
--              + filter indexes for status/applicability/owner/category.
--   Risk:      list ORDER BY inherentScore     covered by (tenantId, inherentScore)
--              + filter indexes for status/score/category/owner.
--   Evidence:  list ORDER BY createdAt         covered by (tenantId, createdAt)
--              + filter indexes for type/status/controlId/archived/retentionUntil.
--   Audit:     list ORDER BY createdAt         GAP — adds (tenantId, createdAt).
--   Policy:    list ORDER BY updatedAt         GAP — adds (tenantId, updatedAt).
--   Vendor:    list ORDER BY [criticality, name]  covered by (tenantId, criticality)
--              + filter indexes for status/criticality/nextReviewAt.
--   Finding:   list ORDER BY createdAt         GAP — adds (tenantId, createdAt).
--
-- Each new index is also a prerequisite for any future cursor-paginated
-- variant: `CURSOR_ORDER_BY` is `[createdAt desc, id desc]` and the
-- per-tenant cursor scan needs a (tenantId, createdAt) prefix to avoid
-- a sort step.
--
-- All three are CREATE INDEX IF NOT EXISTS — idempotent + safe to
-- re-apply. Not CONCURRENTLY because Prisma's migration engine wraps
-- in a transaction, which is incompatible with CONCURRENTLY. The
-- target tables are small (audits/policies/findings have low row
-- counts even at the largest tenants today), so the brief lock window
-- is acceptable. If a future tenant scale-up makes this unsafe, the
-- standard pattern is to ship the index in a separate non-Prisma
-- migration script using CONCURRENTLY.

CREATE INDEX IF NOT EXISTS "Audit_tenantId_createdAt_idx"
    ON "Audit" ("tenantId", "createdAt");

CREATE INDEX IF NOT EXISTS "Policy_tenantId_updatedAt_idx"
    ON "Policy" ("tenantId", "updatedAt");

CREATE INDEX IF NOT EXISTS "Finding_tenantId_createdAt_idx"
    ON "Finding" ("tenantId", "createdAt");
