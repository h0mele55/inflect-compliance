-- Composite indexes that back specific Tasks list-page query paths.
-- Each index pairs with the exact filter+sort it accelerates — no
-- speculative additions. Mirrors the methodology established in
-- 20260428180000_perf_list_indexes (Epic perf #62).

-- Default sort path: WorkItemRepository.list() orders by
-- [{ priority: 'asc' }, { createdAt: 'desc' }] within a tenant.
-- The existing (tenantId, createdAt) index forces a sort on
-- priority. New (tenantId, priority, createdAt) is a covering
-- match for the index-ordered range scan.
CREATE INDEX IF NOT EXISTS "Task_tenantId_priority_createdAt_idx"
    ON "Task" ("tenantId", "priority", "createdAt");

-- Combined (due, status) filter path: the Tasks page exposes
-- due='overdue' and due='next7d' presets, both translated into
--   WHERE dueAt < now() AND status NOT IN (TERMINAL_STATUSES)
-- (or BETWEEN-now-and-now+7d). Existing (tenantId, dueAt) hits
-- the dueAt range cleanly but still scans every overdue row to
-- filter out terminal statuses. (tenantId, dueAt, status)
-- short-circuits the status filter at the index level.
CREATE INDEX IF NOT EXISTS "Task_tenantId_dueAt_status_idx"
    ON "Task" ("tenantId", "dueAt", "status");

-- Reverse-link lookup: WorkItemRepository.list() supports a
-- linkedEntityType+linkedEntityId filter that translates into
--   WHERE tenantId = ... AND links.some(entityType=X AND entityId=Y)
-- Existing (tenantId, taskId) is great for forward lookups
-- (tasks-of-a-link) but useless for reverse (links-pointing-at-X).
-- (tenantId, entityType, entityId) backs the reverse path —
-- e.g. "show me every task that links to control C-42".
CREATE INDEX IF NOT EXISTS "TaskLink_tenantId_entityType_entityId_idx"
    ON "TaskLink" ("tenantId", "entityType", "entityId");
