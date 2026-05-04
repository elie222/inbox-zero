-- Phase 4, plan 04-03 — add DIGEST action to the Marketing rule.
-- Phase 3 D-05 left Marketing as LABEL+ARCHIVE only; Phase 4 D-18/D-19 need Marketing in the digest.
-- IDEMPOTENT: WHERE NOT EXISTS prevents duplicate inserts on re-run.

BEGIN;

-- Verification query (run first; should return 1 row, the Marketing rule):
-- SELECT id, name, "systemType", "emailAccountId" FROM "Rule" WHERE "systemType" = 'MARKETING';

INSERT INTO "Action" (id, type, "ruleId", "emailAccountId", "createdAt", "updatedAt")
SELECT
  -- cuid generated client-side normally; use gen_random_uuid()::text as a one-shot stand-in
  gen_random_uuid()::text,
  'DIGEST'::"ActionType",
  r.id,
  r."emailAccountId",
  NOW(),
  NOW()
FROM "Rule" r
WHERE r."systemType" = 'MARKETING'
  AND NOT EXISTS (
    SELECT 1 FROM "Action" a
    WHERE a."ruleId" = r.id AND a.type = 'DIGEST'
  );

-- Verification: should return 1 row
-- SELECT a.type, r.name FROM "Action" a JOIN "Rule" r ON r.id = a."ruleId" WHERE r."systemType" = 'MARKETING' AND a.type = 'DIGEST';

COMMIT;
