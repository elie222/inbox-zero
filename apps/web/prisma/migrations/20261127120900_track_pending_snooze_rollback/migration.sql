ALTER TABLE "SnoozedThread"
ADD COLUMN "pendingRollbackMessageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "rollbackArchiveObservedIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
