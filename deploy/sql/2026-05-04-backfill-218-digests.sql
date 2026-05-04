-- Phase 4, plan 04-03 — backfill stale Digest rows as SENT (per D-16).
-- These rows accumulated 2026-04-27 → 2026-05-04 with empty content; the digest never sent.
-- Mark them SENT so the first real 9am cron does not include them.
-- IDEMPOTENT: WHERE status != 'SENT' AND createdAt < cutoff.

BEGIN;

-- Verify count BEFORE running. Expect ~218 rows.
-- SELECT count(*), status FROM "Digest"
--   WHERE status != 'SENT' AND "createdAt" < '2026-05-04 14:00:00+00'   -- 10am ET = 14:00 UTC EDT
--   GROUP BY status;

UPDATE "Digest"
   SET status = 'SENT',
       "sentAt" = COALESCE("sentAt", "createdAt"),
       "updatedAt" = NOW()
 WHERE status != 'SENT'
   AND "createdAt" < '2026-05-04 14:00:00+00';   -- adjust to actual deploy timestamp before running

-- Optional hygiene: redact stale DigestItem content
UPDATE "DigestItem"
   SET content = '[REDACTED]'
 WHERE "digestId" IN (
   SELECT id FROM "Digest"
    WHERE status = 'SENT' AND "sentAt" = "createdAt" AND "createdAt" < '2026-05-04 14:00:00+00'
 )
 AND content != '[REDACTED]';

-- Verification: should report 0 PENDING rows older than cutoff
-- SELECT count(*) FROM "Digest" WHERE status != 'SENT' AND "createdAt" < '2026-05-04 14:00:00+00';

COMMIT;
