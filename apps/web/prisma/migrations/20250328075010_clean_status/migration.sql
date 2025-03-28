-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CleanupThreadStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "CleanupJob" ADD COLUMN     "status" "JobStatus" NOT NULL DEFAULT 'RUNNING';

-- AlterTable
ALTER TABLE "CleanupThread" ADD COLUMN     "status" "CleanupThreadStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "CleanupThread_userId_jobId_status_idx" ON "CleanupThread"("userId", "jobId", "status");

-- CreateIndex
CREATE INDEX "CleanupThread_userId_jobId_archived_idx" ON "CleanupThread"("userId", "jobId", "archived");
