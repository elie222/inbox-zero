-- AlterTable
ALTER TABLE "User" ADD COLUMN     "surveyFeatures" TEXT[],
ADD COLUMN     "surveyGoal" TEXT,
ADD COLUMN     "surveyImprovements" TEXT,
ADD COLUMN     "surveyRole" TEXT,
ADD COLUMN     "surveySource" TEXT;
