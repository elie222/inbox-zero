-- Indexes for the admin dashboard, which is the first surface in the app that
-- reads across tenants. Every existing ExecutedRule index leads with
-- emailAccountId, and User had no indexes at all beyond unique email, so these
-- queries were unindexed seq scans.
--
-- The two partial indexes cannot be expressed in schema.prisma and live only
-- here, matching DraftSendLog_replyMemorySentText_createdAt_idx and
-- Newsletter_patternAnalyzed_... from 20260503110000_add_query_performance_indexes.
-- Their predicates must stay byte-identical to the queries in
-- app/api/admin/errors/route.ts or Postgres will not use them.
--
-- Non-concurrent: Prisma wraps each migration in a transaction, which forbids
-- CREATE INDEX CONCURRENTLY, and no migration in this repo uses it. On a large
-- production table an operator can build the two plain indexes manually with
-- CONCURRENTLY first; IF NOT EXISTS then makes this a no-op.

-- The admin user list pages through signups newest-first.
-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");

-- Same, for the per-day "mailboxes connected" series on the overview.
-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailAccount_createdAt_idx" ON "EmailAccount"("createdAt");

-- The failure feed reads only ERROR rows, a small fraction of ExecutedRule.
-- A full (status, createdAt) index on the highest-write table in the schema
-- would be large and write-costly; a partial index stays small.
-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExecutedRule_error_createdAt_idx"
  ON "ExecutedRule"("createdAt" DESC)
  WHERE "status" = 'ERROR';

-- "Users currently in a broken state" reads the handful of rows carrying a
-- non-empty errorMessages blob.
-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_errorMessages_updatedAt_idx"
  ON "User"("updatedAt" DESC)
  WHERE "errorMessages" IS NOT NULL AND "errorMessages" <> '{}'::jsonb;
