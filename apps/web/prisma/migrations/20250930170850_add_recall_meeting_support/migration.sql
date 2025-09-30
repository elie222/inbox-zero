-- CreateEnum
CREATE TYPE "RecallBotStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "status" "RecallBotStatus" NOT NULL DEFAULT 'SCHEDULED',
    "transcript" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "botWillJoinAt" TIMESTAMP(3) NOT NULL,
    "meetingUrl" TEXT NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CalendarConnection" ADD COLUMN "recallCalendarId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_botId_key" ON "Meeting"("botId");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_deduplicationKey_key" ON "Meeting"("deduplicationKey");

-- CreateIndex
CREATE INDEX "Meeting_emailAccountId_eventId_status_idx" ON "Meeting"("emailAccountId", "eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarConnection_recallCalendarId_key" ON "CalendarConnection"("recallCalendarId");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
