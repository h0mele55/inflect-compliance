-- Epic G-5 — extend EmailNotificationType with the exception-expiring
-- bucket. ALTER TYPE … ADD VALUE is forward-compatible (rolling
-- deploys see the value before any writer uses it).

ALTER TYPE "EmailNotificationType" ADD VALUE IF NOT EXISTS 'EXCEPTION_EXPIRING';
