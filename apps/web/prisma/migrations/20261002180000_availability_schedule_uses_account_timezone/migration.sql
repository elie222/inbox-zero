-- Keep the schedule's timezone for accounts that never saved one, since
-- availability and booking links now read EmailAccount.timezone.
UPDATE "EmailAccount" AS ea
SET "timezone" = s."timezone"
FROM "AvailabilitySchedule" AS s
WHERE s."emailAccountId" = ea."id"
  AND s."isDefault" = true
  AND ea."timezone" IS NULL;

-- New code no longer writes this column. The default keeps it non-null for
-- any deployment that still reads it until the column is dropped.
ALTER TABLE "AvailabilitySchedule" ALTER COLUMN "timezone" SET DEFAULT 'UTC';
