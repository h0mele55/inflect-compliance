-- Epic G-3 prompt 8 — additional outbound notifications.
-- Three additive enum values for the questionnaire lifecycle:
--   VENDOR_ASSESSMENT_REMINDER  — admin-triggered resend
--   VENDOR_ASSESSMENT_SUBMITTED — auto-fired on submitResponse
--   VENDOR_ASSESSMENT_REVIEWED  — auto-fired on reviewAssessment

ALTER TYPE "EmailNotificationType" ADD VALUE 'VENDOR_ASSESSMENT_REMINDER';
ALTER TYPE "EmailNotificationType" ADD VALUE 'VENDOR_ASSESSMENT_SUBMITTED';
ALTER TYPE "EmailNotificationType" ADD VALUE 'VENDOR_ASSESSMENT_REVIEWED';
