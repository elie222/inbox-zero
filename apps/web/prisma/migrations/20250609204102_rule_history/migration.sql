-- AlterTable
ALTER TABLE "Rule" ADD COLUMN     "promptText" TEXT;

-- CreateTable
CREATE TABLE "RuleHistory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ruleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "triggerType" TEXT NOT NULL,
    "promptText" TEXT,
    "name" TEXT NOT NULL,
    "instructions" TEXT,
    "enabled" BOOLEAN NOT NULL,
    "automate" BOOLEAN NOT NULL,
    "runOnThreads" BOOLEAN NOT NULL,
    "conditionalOperator" TEXT NOT NULL,
    "from" TEXT,
    "to" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "categoryFilterType" TEXT,
    "systemType" TEXT,
    "actions" JSONB NOT NULL,
    "categoryFilters" JSONB,

    CONSTRAINT "RuleHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RuleHistory_ruleId_createdAt_idx" ON "RuleHistory"("ruleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RuleHistory_ruleId_version_key" ON "RuleHistory"("ruleId", "version");

-- AddForeignKey
ALTER TABLE "RuleHistory" ADD CONSTRAINT "RuleHistory_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
