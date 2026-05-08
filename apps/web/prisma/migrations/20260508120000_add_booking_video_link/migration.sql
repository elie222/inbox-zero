-- AlterEnum
ALTER TYPE "BookingEventTypeLocationType" ADD VALUE 'MICROSOFT_TEAMS';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "videoConferenceLink" TEXT;
