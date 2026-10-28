ALTER TABLE "EmailAccount" ADD COLUMN "mailHiddenBuiltInSplits" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
