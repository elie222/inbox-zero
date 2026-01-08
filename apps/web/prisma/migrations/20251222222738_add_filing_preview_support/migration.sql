-- AlterEnum
ALTER TYPE "DocumentFilingStatus" ADD VALUE 'PREVIEW';

-- AlterTable
ALTER TABLE "DocumentFiling" ADD COLUMN     "feedbackAt" TIMESTAMP(3),
ADD COLUMN     "feedbackPositive" BOOLEAN,
ALTER COLUMN "folderId" DROP NOT NULL,
ALTER COLUMN "notificationToken" DROP NOT NULL;
