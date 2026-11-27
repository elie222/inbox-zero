ALTER TABLE "EmailAccount" ADD COLUMN "snoozeMutationLeaseUntil" TIMESTAMP(3);
ALTER TABLE "SnoozedThread" ADD COLUMN "targetOutcomes" JSONB;
