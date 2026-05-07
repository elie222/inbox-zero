-- CreateEnum
CREATE TYPE "BookingEventTypeLocationType" AS ENUM ('IN_PERSON', 'GOOGLE_MEET', 'PHONE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BookingEventTypeHostRole" AS ENUM ('HOST');

-- CreateEnum
CREATE TYPE "BookingDateOverrideType" AS ENUM ('BLOCKED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_PROVIDER_EVENT', 'CONFIRMED', 'CANCELED', 'FAILED');

-- CreateEnum
CREATE TYPE "BookingCanceledBy" AS ENUM ('HOST', 'GUEST', 'SYSTEM');

-- CreateEnum
CREATE TYPE "BookingCreationSource" AS ENUM ('PUBLIC');

-- CreateTable
CREATE TABLE "BookingLink" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "slug" TEXT NOT NULL,
    "aliasSlug" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "timezone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailAccountId" TEXT NOT NULL,
    "organizationId" TEXT,
    "defaultEventTypeId" TEXT,

    CONSTRAINT "BookingLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingEventType" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "slotIntervalMinutes" INTEGER NOT NULL,
    "locationType" "BookingEventTypeLocationType" NOT NULL DEFAULT 'CUSTOM',
    "locationValue" TEXT,
    "minimumNoticeMinutes" INTEGER NOT NULL DEFAULT 120,
    "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
    "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    "bookingWindowDays" INTEGER NOT NULL DEFAULT 30,
    "maxActiveBookingsPerGuest" INTEGER,
    "disableCancelling" BOOLEAN NOT NULL DEFAULT false,
    "hideHostEmail" BOOLEAN NOT NULL DEFAULT false,
    "hideCalendarEventDetails" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "bookingLinkId" TEXT NOT NULL,

    CONSTRAINT "BookingEventType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingSchedule" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "BookingSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingEventTypeHost" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" "BookingEventTypeHostRole" NOT NULL DEFAULT 'HOST',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "eventTypeId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "destinationCalendarId" TEXT,

    CONSTRAINT "BookingEventTypeHost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAvailabilityRule" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "scheduleId" TEXT NOT NULL,

    CONSTRAINT "BookingAvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingDateOverride" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "date" TEXT NOT NULL,
    "type" "BookingDateOverrideType" NOT NULL DEFAULT 'BLOCKED',
    "scheduleId" TEXT NOT NULL,

    CONSTRAINT "BookingDateOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "uid" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT NOT NULL,
    "guestAdditionalEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "guestNote" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_PROVIDER_EVENT',
    "provider" TEXT,
    "providerCalendarId" TEXT,
    "providerEventId" TEXT,
    "cancelTokenHash" TEXT NOT NULL,
    "cancellationReason" TEXT,
    "canceledBy" "BookingCanceledBy",
    "creationSource" "BookingCreationSource" NOT NULL DEFAULT 'PUBLIC',
    "idempotencyToken" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "eventTypeTitle" TEXT NOT NULL,
    "eventTypeDurationMinutes" INTEGER NOT NULL,
    "eventTypeLocationType" "BookingEventTypeLocationType" NOT NULL,
    "eventTypeLocationValue" TEXT,
    "eventTypeTimezone" TEXT NOT NULL,
    "eventTypeId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingSlotLock" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "eventTypeId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "bookingId" TEXT,

    CONSTRAINT "BookingSlotLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingLink_slug_key" ON "BookingLink"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "BookingLink_aliasSlug_key" ON "BookingLink"("aliasSlug");

-- CreateIndex
CREATE INDEX "BookingLink_emailAccountId_idx" ON "BookingLink"("emailAccountId");

-- CreateIndex
CREATE INDEX "BookingLink_organizationId_idx" ON "BookingLink"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingEventType_bookingLinkId_slug_key" ON "BookingEventType"("bookingLinkId", "slug");

-- CreateIndex
CREATE INDEX "BookingEventType_bookingLinkId_idx" ON "BookingEventType"("bookingLinkId");

-- CreateIndex
CREATE INDEX "BookingSchedule_emailAccountId_idx" ON "BookingSchedule"("emailAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingEventTypeHost_eventTypeId_emailAccountId_key" ON "BookingEventTypeHost"("eventTypeId", "emailAccountId");

-- CreateIndex
CREATE INDEX "BookingEventTypeHost_emailAccountId_idx" ON "BookingEventTypeHost"("emailAccountId");

-- CreateIndex
CREATE INDEX "BookingEventTypeHost_scheduleId_idx" ON "BookingEventTypeHost"("scheduleId");

-- CreateIndex
CREATE INDEX "BookingEventTypeHost_destinationCalendarId_idx" ON "BookingEventTypeHost"("destinationCalendarId");

-- CreateIndex
CREATE INDEX "BookingAvailabilityRule_scheduleId_idx" ON "BookingAvailabilityRule"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingDateOverride_scheduleId_date_key" ON "BookingDateOverride"("scheduleId", "date");

-- CreateIndex
CREATE INDEX "BookingDateOverride_scheduleId_idx" ON "BookingDateOverride"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_uid_key" ON "Booking"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_eventTypeId_idempotencyToken_key" ON "Booking"("eventTypeId", "idempotencyToken");

-- CreateIndex
CREATE INDEX "Booking_eventTypeId_startTime_endTime_idx" ON "Booking"("eventTypeId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "Booking_emailAccountId_idx" ON "Booking"("emailAccountId");

-- CreateIndex
CREATE INDEX "Booking_guestEmail_idx" ON "Booking"("guestEmail");

-- CreateIndex
CREATE INDEX "BookingSlotLock_emailAccountId_startTime_endTime_idx" ON "BookingSlotLock"("emailAccountId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "BookingSlotLock_expiresAt_idx" ON "BookingSlotLock"("expiresAt");

-- CreateIndex
CREATE INDEX "BookingSlotLock_bookingId_idx" ON "BookingSlotLock"("bookingId");

-- AddForeignKey
ALTER TABLE "BookingLink" ADD CONSTRAINT "BookingLink_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingLink" ADD CONSTRAINT "BookingLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingLink" ADD CONSTRAINT "BookingLink_defaultEventTypeId_fkey" FOREIGN KEY ("defaultEventTypeId") REFERENCES "BookingEventType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEventType" ADD CONSTRAINT "BookingEventType_bookingLinkId_fkey" FOREIGN KEY ("bookingLinkId") REFERENCES "BookingLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSchedule" ADD CONSTRAINT "BookingSchedule_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEventTypeHost" ADD CONSTRAINT "BookingEventTypeHost_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "BookingEventType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEventTypeHost" ADD CONSTRAINT "BookingEventTypeHost_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEventTypeHost" ADD CONSTRAINT "BookingEventTypeHost_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BookingSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEventTypeHost" ADD CONSTRAINT "BookingEventTypeHost_destinationCalendarId_fkey" FOREIGN KEY ("destinationCalendarId") REFERENCES "Calendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAvailabilityRule" ADD CONSTRAINT "BookingAvailabilityRule_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BookingSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingDateOverride" ADD CONSTRAINT "BookingDateOverride_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BookingSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "BookingEventType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSlotLock" ADD CONSTRAINT "BookingSlotLock_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "BookingEventType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSlotLock" ADD CONSTRAINT "BookingSlotLock_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSlotLock" ADD CONSTRAINT "BookingSlotLock_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prevent overlapping slot locks for the same host across all of their event types
-- so concurrent bookings cannot both succeed.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "BookingSlotLock" ADD CONSTRAINT "BookingSlotLock_no_overlap" EXCLUDE USING gist (
    "emailAccountId" WITH =,
    tstzrange("startTime", "endTime", '[)') WITH &&
);
