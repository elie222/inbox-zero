-- Rename column and convert milliseconds to minutes
ALTER TABLE "ResponseTime" RENAME COLUMN "responseTimeMs" TO "responseTimeMins";

-- Convert existing values from milliseconds to minutes
UPDATE "ResponseTime" SET "responseTimeMins" = "responseTimeMins" / 60000;
