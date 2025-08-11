-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'MOVE_FOLDER';

-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "folderName" TEXT;

-- AlterTable
ALTER TABLE "ExecutedAction" ADD COLUMN     "folderName" TEXT;

-- AlterTable
ALTER TABLE "ScheduledAction" ADD COLUMN     "folderName" TEXT;

-- AlterTable
ALTER TABLE "VerificationToken" ALTER COLUMN "id" DROP DEFAULT;
