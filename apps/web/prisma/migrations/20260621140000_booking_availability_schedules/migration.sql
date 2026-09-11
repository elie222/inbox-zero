-- CreateTable
CREATE TABLE "AvailabilitySchedule" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "AvailabilitySchedule_pkey" PRIMARY KEY ("id")
);

CREATE TEMP TABLE "BookingLinkAvailabilityScheduleMigration" (
    "bookingLinkId" TEXT NOT NULL,
    "availabilityScheduleId" TEXT NOT NULL
);

INSERT INTO "BookingLinkAvailabilityScheduleMigration" (
    "bookingLinkId",
    "availabilityScheduleId"
)
SELECT
    id,
    gen_random_uuid()::text
FROM "BookingLink";

-- Copy existing booking link availability settings into reusable schedules.
INSERT INTO "AvailabilitySchedule" (
    "id",
    "createdAt",
    "updatedAt",
    "name",
    "isDefault",
    "timezone",
    "emailAccountId"
)
SELECT
    mapping."availabilityScheduleId",
    booking_link."createdAt",
    booking_link."updatedAt",
    'Default availability',
    true,
    booking_link."timezone",
    booking_link."emailAccountId"
FROM "BookingLink" booking_link
INNER JOIN "BookingLinkAvailabilityScheduleMigration" mapping
    ON mapping."bookingLinkId" = booking_link.id;

-- Add the booking-link schedule pointer as nullable while existing rows are linked.
ALTER TABLE "BookingLink" ADD COLUMN "availabilityScheduleId" TEXT;

UPDATE "BookingLink" bl
SET "availabilityScheduleId" = mapping."availabilityScheduleId"
FROM "BookingLinkAvailabilityScheduleMigration" mapping
WHERE mapping."bookingLinkId" = bl.id;

-- Existing booking links must now point to an account-owned availability schedule.
ALTER TABLE "BookingLink" ALTER COLUMN "availabilityScheduleId" SET NOT NULL;

-- Rename booking windows to availability windows and attach each window to the
-- schedule that replaced its booking-link parent.
ALTER TABLE "BookingWindow" RENAME TO "AvailabilityWindow";
ALTER TABLE "AvailabilityWindow" RENAME CONSTRAINT "BookingWindow_pkey" TO "AvailabilityWindow_pkey";
ALTER INDEX "BookingWindow_bookingLinkId_idx" RENAME TO "AvailabilityWindow_bookingLinkId_idx";
ALTER TABLE "AvailabilityWindow" DROP CONSTRAINT "BookingWindow_bookingLinkId_fkey";
ALTER TABLE "AvailabilityWindow" RENAME COLUMN "bookingLinkId" TO "availabilityScheduleId";

UPDATE "AvailabilityWindow" availability_window
SET "availabilityScheduleId" = bl."availabilityScheduleId"
FROM "BookingLink" bl
WHERE availability_window."availabilityScheduleId" = bl.id;

ALTER INDEX "AvailabilityWindow_bookingLinkId_idx" RENAME TO "AvailabilityWindow_availabilityScheduleId_idx";

-- Drop old constraints/columns after data has moved.
ALTER TABLE "BookingLink" DROP COLUMN "timezone";

-- CreateIndex
CREATE INDEX "AvailabilitySchedule_emailAccountId_idx" ON "AvailabilitySchedule"("emailAccountId");

-- CreateIndex
CREATE INDEX "AvailabilitySchedule_emailAccountId_isDefault_idx" ON "AvailabilitySchedule"("emailAccountId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilitySchedule_emailAccountId_default_key" ON "AvailabilitySchedule"("emailAccountId") WHERE "isDefault" = true;

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilitySchedule_id_emailAccountId_key" ON "AvailabilitySchedule"("id", "emailAccountId");

-- CreateIndex
CREATE INDEX "BookingLink_availabilityScheduleId_idx" ON "BookingLink"("availabilityScheduleId");

-- AddForeignKey
ALTER TABLE "AvailabilitySchedule" ADD CONSTRAINT "AvailabilitySchedule_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingLink" ADD CONSTRAINT "BookingLink_availabilityScheduleId_emailAccountId_fkey" FOREIGN KEY ("availabilityScheduleId", "emailAccountId") REFERENCES "AvailabilitySchedule"("id", "emailAccountId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityWindow" ADD CONSTRAINT "AvailabilityWindow_availabilityScheduleId_fkey" FOREIGN KEY ("availabilityScheduleId") REFERENCES "AvailabilitySchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "BookingLinkAvailabilityScheduleMigration";
