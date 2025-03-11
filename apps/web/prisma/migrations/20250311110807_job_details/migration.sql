-- CreateEnum
CREATE TYPE "CleanAction" AS ENUM ('ARCHIVE', 'MARK_READ');

-- AlterTable
ALTER TABLE "CleanupJob" ADD COLUMN     "action" "CleanAction" NOT NULL DEFAULT 'ARCHIVE',
ADD COLUMN     "daysOld" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "instructions" TEXT;
