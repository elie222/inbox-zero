-- AlterTable
ALTER TABLE "User" 
ADD COLUMN "completedAppOnboardingAt" TIMESTAMP(3),
ADD COLUMN "completedOnboardingAt" TIMESTAMP(3);

-- UpdateData
UPDATE "User"
SET "completedOnboardingAt" = CASE 
    WHEN "completedOnboarding" = true THEN "createdAt"
    ELSE NULL
END;
