-- ═══════════════════════════════════════════════════════════════════
-- Epic G-4 reminder — extend EmailNotificationType with the new
-- access-review reminder bucket. ALTER TYPE … ADD VALUE is
-- forward-compatible (rolling deploys see the value before any
-- writer uses it).
-- ═══════════════════════════════════════════════════════════════════

ALTER TYPE "EmailNotificationType" ADD VALUE IF NOT EXISTS 'ACCESS_REVIEW_REMINDER';
