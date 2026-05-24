-- Audit Coherence S7 (2026-05-24) — escalation email type.
--
-- The campaign reviewer already gets the per-day reminder
-- (ACCESS_REVIEW_REMINDER, Epic G-4). When the campaign is past
-- the grace tail AND still has pending decisions, tenant
-- ADMIN/OWNERs also need a nudge so they can intervene
-- (reassign, force-close, or chase the reviewer).
--
-- One new EmailNotificationType value; no table changes.

ALTER TYPE "EmailNotificationType"
    ADD VALUE IF NOT EXISTS 'ACCESS_REVIEW_OVERDUE_ESCALATION';
