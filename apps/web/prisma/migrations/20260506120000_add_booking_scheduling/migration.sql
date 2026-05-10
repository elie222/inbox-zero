-- CreateEnum
CREATE TYPE "BookingLinkLocationType" AS ENUM ('IN_PERSON', 'GOOGLE_MEET', 'MICROSOFT_TEAMS', 'PHONE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_PROVIDER_EVENT', 'CONFIRMED', 'CANCELED', 'FAILED');

-- CreateEnum
CREATE TYPE "BookingCanceledBy" AS ENUM ('HOST', 'GUEST', 'SYSTEM');

-- CreateTable
CREATE TABLE "BookingLink" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "durationMinutes" INTEGER NOT NULL,
    "slotIntervalMinutes" INTEGER NOT NULL,
    "locationType" "BookingLinkLocationType" NOT NULL DEFAULT 'CUSTOM',
    "locationValue" TEXT,
    "minimumNoticeMinutes" INTEGER NOT NULL DEFAULT 120,
    "maxDaysAhead" INTEGER NOT NULL DEFAULT 30,
    "timezone" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "destinationCalendarId" TEXT,

    CONSTRAINT "BookingLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingWindow" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "bookingLinkId" TEXT NOT NULL,

    CONSTRAINT "BookingWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "uid" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT NOT NULL,
    "guestNote" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_PROVIDER_EVENT',
    "provider" TEXT,
    "providerCalendarId" TEXT,
    "providerEventId" TEXT,
    "videoConferenceLink" TEXT,
    "cancelTokenHash" TEXT NOT NULL,
    "cancellationReason" TEXT,
    "canceledBy" "BookingCanceledBy",
    "idempotencyToken" TEXT,
    "linkTitle" TEXT NOT NULL,
    "linkLocationType" "BookingLinkLocationType" NOT NULL,
    "linkLocationValue" TEXT,
    "linkTimezone" TEXT NOT NULL,
    "bookingLinkId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingLink_slug_key" ON "BookingLink"("slug");

-- CreateIndex
CREATE INDEX "BookingLink_emailAccountId_idx" ON "BookingLink"("emailAccountId");

-- CreateIndex
CREATE INDEX "BookingLink_destinationCalendarId_idx" ON "BookingLink"("destinationCalendarId");

-- CreateIndex
CREATE INDEX "BookingWindow_bookingLinkId_idx" ON "BookingWindow"("bookingLinkId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_uid_key" ON "Booking"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingLinkId_idempotencyToken_key" ON "Booking"("bookingLinkId", "idempotencyToken");

-- CreateIndex
CREATE INDEX "Booking_bookingLinkId_startTime_endTime_idx" ON "Booking"("bookingLinkId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "Booking_emailAccountId_idx" ON "Booking"("emailAccountId");

-- CreateIndex
CREATE INDEX "Booking_guestEmail_idx" ON "Booking"("guestEmail");

-- AddForeignKey
ALTER TABLE "BookingLink" ADD CONSTRAINT "BookingLink_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingLink" ADD CONSTRAINT "BookingLink_destinationCalendarId_fkey" FOREIGN KEY ("destinationCalendarId") REFERENCES "Calendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingWindow" ADD CONSTRAINT "BookingWindow_bookingLinkId_fkey" FOREIGN KEY ("bookingLinkId") REFERENCES "BookingLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_bookingLinkId_fkey" FOREIGN KEY ("bookingLinkId") REFERENCES "BookingLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prevent overlapping live bookings for the same host. Replaces the old
-- BookingSlotLock table: the Booking row itself acts as the lock, scoped to
-- statuses that occupy a host's calendar.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_no_overlap" EXCLUDE USING gist (
    "emailAccountId" WITH =,
    tsrange("startTime", "endTime", '[)') WITH &&
) WHERE ("status" IN ('PENDING_PROVIDER_EVENT', 'CONFIRMED'));
