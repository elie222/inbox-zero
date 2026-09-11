-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'INTEGRATION';

-- AlterTable
ALTER TABLE "McpTool" ADD COLUMN "isWrite" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Action" ADD COLUMN "integrationName" TEXT,
ADD COLUMN "integrationToolName" TEXT,
ADD COLUMN "integrationArgs" JSONB;

-- AlterTable
ALTER TABLE "ExecutedAction" ADD COLUMN "integrationName" TEXT,
ADD COLUMN "integrationToolName" TEXT,
ADD COLUMN "integrationArgs" JSONB;
