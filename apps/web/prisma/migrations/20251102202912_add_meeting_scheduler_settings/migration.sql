-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "meetingSchedulerAutoCreate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "meetingSchedulerDefaultDuration" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "meetingSchedulerEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "meetingSchedulerPreferredProvider" TEXT,
ADD COLUMN     "meetingSchedulerWorkingHoursEnd" INTEGER NOT NULL DEFAULT 17,
ADD COLUMN     "meetingSchedulerWorkingHoursStart" INTEGER NOT NULL DEFAULT 9;
