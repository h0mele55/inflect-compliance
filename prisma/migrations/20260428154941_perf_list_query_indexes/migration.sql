-- GAP-perf — composite indexes for the hot list-query filter shapes.
--
-- Justification per index (each index = one specific query path
-- in the existing list usecases):
--
--   Risk(tenantId, ownerUserId)       — RiskFilters.ownerUserId
--   Risk(tenantId, score)             — RiskFilters.scoreMin/scoreMax
--   Risk(tenantId, inherentScore)     — listRisks default sort (orderBy: { inherentScore: 'desc' })
--   Control(tenantId, ownerUserId)    — ControlListFilters.ownerUserId; existing [ownerUserId]
--                                        index isn't tenant-prefixed so the planner can't slice
--                                        one tenant's range without an extra filter pass.
--   Control(tenantId, category)       — ControlListFilters.category
--   Evidence(tenantId, status)        — EvidenceListFilters.status
--   Evidence(tenantId, controlId)     — EvidenceListFilters.controlId (control-detail page hits this)
--   Evidence(tenantId, type)          — EvidenceListFilters.type
--   ControlTask(tenantId, status, dueAt) — backs the dashboard "overdue tasks" predicate
--                                          (status IN ('OPEN','IN_PROGRESS') AND dueAt < now())
--                                          and the runConsistencyCheck overdue lookup. The
--                                          existing [status] / [dueAt] single-column indexes
--                                          can't satisfy the combined predicate efficiently.
--
-- Lock model: each `CREATE INDEX` here takes a brief share-lock
-- on the target table (no row writes during the build). For the
-- table sizes in Inflect production today this is sub-second per
-- index; not zero, but well below the 30s grace window of any
-- realistic deploy. Operators on much larger tables should split
-- this into per-index migrations using CREATE INDEX CONCURRENTLY
-- (which requires running outside a transaction — incompatible
-- with Prisma's default migration wrapper).
--
-- IF NOT EXISTS guards make the migration re-runnable without
-- error if one of these indexes was hand-created post-hoc.

CREATE INDEX IF NOT EXISTS "Risk_tenantId_ownerUserId_idx"
    ON "Risk" ("tenantId", "ownerUserId");

CREATE INDEX IF NOT EXISTS "Risk_tenantId_score_idx"
    ON "Risk" ("tenantId", "score");

CREATE INDEX IF NOT EXISTS "Risk_tenantId_inherentScore_idx"
    ON "Risk" ("tenantId", "inherentScore");

CREATE INDEX IF NOT EXISTS "Control_tenantId_ownerUserId_idx"
    ON "Control" ("tenantId", "ownerUserId");

CREATE INDEX IF NOT EXISTS "Control_tenantId_category_idx"
    ON "Control" ("tenantId", "category");

CREATE INDEX IF NOT EXISTS "Evidence_tenantId_status_idx"
    ON "Evidence" ("tenantId", "status");

CREATE INDEX IF NOT EXISTS "Evidence_tenantId_controlId_idx"
    ON "Evidence" ("tenantId", "controlId");

CREATE INDEX IF NOT EXISTS "Evidence_tenantId_type_idx"
    ON "Evidence" ("tenantId", "type");

CREATE INDEX IF NOT EXISTS "ControlTask_tenantId_status_dueAt_idx"
    ON "ControlTask" ("tenantId", "status", "dueAt");
