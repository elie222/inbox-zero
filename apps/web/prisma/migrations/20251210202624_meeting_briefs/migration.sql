-- CreateEnum
CREATE TYPE "MeetingBriefingStatus" AS ENUM ('SENT', 'FAILED');

-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "meetingBriefingsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "meetingBriefingsMinutesBefore" INTEGER NOT NULL DEFAULT 240;

-- CreateTable
CREATE TABLE "MeetingBriefing" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calendarEventId" TEXT NOT NULL,
    "eventTitle" TEXT NOT NULL,
    "eventStartTime" TIMESTAMP(3) NOT NULL,
    "guestCount" INTEGER NOT NULL,
    "status" "MeetingBriefingStatus" NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "MeetingBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingBriefing_emailAccountId_idx" ON "MeetingBriefing"("emailAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingBriefing_emailAccountId_calendarEventId_key" ON "MeetingBriefing"("emailAccountId", "calendarEventId");

-- AddForeignKey
ALTER TABLE "MeetingBriefing" ADD CONSTRAINT "MeetingBriefing_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
