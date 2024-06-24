-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "bccPrompt" TEXT,
ADD COLUMN     "ccPrompt" TEXT,
ADD COLUMN     "contentPrompt" TEXT,
ADD COLUMN     "labelPrompt" TEXT,
ADD COLUMN     "subjectPrompt" TEXT,
ADD COLUMN     "toPrompt" TEXT;
