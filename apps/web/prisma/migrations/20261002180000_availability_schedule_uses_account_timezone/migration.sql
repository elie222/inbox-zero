-- Keep the schedule's timezone for accounts that never saved one, since
-- availability and booking links now read EmailAccount.timezone.
UPDATE "EmailAccount" AS ea
SET "timezone" = s."timezone"
FROM "AvailabilitySchedule" AS s
WHERE s."emailAccountId" = ea."id"
  AND s."isDefault" = true
  AND ea."timezone" IS NULL;

-- AlterTable
ALTER TABLE "AvailabilitySchedule" ALTER COLUMN "timezone" DROP NOT NULL;
