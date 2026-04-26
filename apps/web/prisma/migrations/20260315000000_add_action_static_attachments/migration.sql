ALTER TABLE "Action" ADD COLUMN "staticAttachments" JSONB;
ALTER TABLE "ExecutedAction" ADD COLUMN "staticAttachments" JSONB;
ALTER TABLE "ScheduledAction" ADD COLUMN "staticAttachments" JSONB;
