-- CreateEnum
CREATE TYPE "MeetingJoinRule" AS ENUM ('ALL', 'EXTERNAL_ONLY', 'HOST_ONLY', 'OFF');

-- CreateEnum
CREATE TYPE "MeetingRecordingStatus" AS ENUM ('PENDING', 'SCHEDULED', 'JOINING', 'IN_WAITING_ROOM', 'IN_CALL', 'RECORDING', 'CALL_ENDED', 'DONE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MeetingProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "meetingRecorderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "meetingRecorderFollowUpDraftEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "meetingRecorderJoinRule" "MeetingJoinRule" NOT NULL DEFAULT 'EXTERNAL_ONLY',
ADD COLUMN     "meetingRecorderRecapEmailEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "MeetingRecording" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "botProvider" TEXT NOT NULL DEFAULT 'recall',
    "externalBotId" TEXT,
    "externalRecordingId" TEXT,
    "transcriptRequestedAt" TIMESTAMP(3),
    "externalTranscriptId" TEXT,
    "meetingUrl" TEXT NOT NULL,
    "normalizedMeetingUrl" TEXT NOT NULL,
    "activeKey" TEXT,
    "meetingStartTime" TIMESTAMP(3) NOT NULL,
    "status" "MeetingRecordingStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "transcript" JSONB,
    "transcriptFetchedAt" TIMESTAMP(3),
    "mediaDeletedAt" TIMESTAMP(3),

    CONSTRAINT "MeetingRecording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "eventTitle" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "attendees" JSONB NOT NULL,
    "organizerEmail" TEXT,
    "joinOverride" BOOLEAN,
    "processingStatus" "MeetingProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "summary" JSONB,
    "followUpDraftStartedAt" TIMESTAMP(3),
    "followUpDraftId" TEXT,
    "recapSentAt" TIMESTAMP(3),
    "processingError" TEXT,
    "recordingId" TEXT,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingRecording_normalizedMeetingUrl_meetingStartTime_idx" ON "MeetingRecording"("normalizedMeetingUrl", "meetingStartTime");

-- CreateIndex
CREATE INDEX "MeetingRecording_status_meetingStartTime_idx" ON "MeetingRecording"("status", "meetingStartTime");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingRecording_botProvider_externalBotId_key" ON "MeetingRecording"("botProvider", "externalBotId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingRecording_activeKey_meetingStartTime_key" ON "MeetingRecording"("activeKey", "meetingStartTime");

-- CreateIndex
CREATE INDEX "Meeting_emailAccountId_startTime_idx" ON "Meeting"("emailAccountId", "startTime");

-- CreateIndex
CREATE INDEX "Meeting_recordingId_idx" ON "Meeting"("recordingId");

-- CreateIndex
CREATE INDEX "Meeting_processingStatus_updatedAt_idx" ON "Meeting"("processingStatus", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_emailAccountId_calendarEventId_key" ON "Meeting"("emailAccountId", "calendarEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_emailAccountId_recordingId_key" ON "Meeting"("emailAccountId", "recordingId");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "MeetingRecording"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
