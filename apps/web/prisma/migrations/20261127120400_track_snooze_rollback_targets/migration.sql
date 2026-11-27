ALTER TABLE "SnoozedThread" ADD COLUMN "restoreMessageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
