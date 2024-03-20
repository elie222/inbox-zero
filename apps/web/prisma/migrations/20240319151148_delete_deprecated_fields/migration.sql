-- Remove the deprecated columns from the ExecutedRule table
ALTER TABLE "ExecutedRule" DROP COLUMN "actions";
ALTER TABLE "ExecutedRule" DROP COLUMN "data";
