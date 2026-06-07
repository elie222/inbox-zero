-- AlterTable
ALTER TABLE "Rule" ADD COLUMN     "organizationRuleId" TEXT,
ADD COLUMN     "organizationRuleMemberEnabled" BOOLEAN;

-- CreateTable
CREATE TABLE "OrganizationRule" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "instructions" TEXT,
    "runOnThreads" BOOLEAN NOT NULL DEFAULT false,
    "conditionalOperator" "LogicalOperator" NOT NULL DEFAULT 'AND',
    "from" TEXT,
    "to" TEXT,
    "subject" TEXT,
    "body" TEXT,

    CONSTRAINT "OrganizationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationRuleAction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationRuleId" TEXT NOT NULL,
    "type" "ActionType" NOT NULL,
    "label" TEXT,
    "subject" TEXT,
    "content" TEXT,
    "to" TEXT,
    "cc" TEXT,
    "bcc" TEXT,
    "url" TEXT,
    "folderName" TEXT,
    "delayInMinutes" INTEGER,
    "staticAttachments" JSONB,

    CONSTRAINT "OrganizationRuleAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationRule_organizationId_enabled_idx" ON "OrganizationRule"("organizationId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationRule_organizationId_name_key" ON "OrganizationRule"("organizationId", "name");

-- CreateIndex
CREATE INDEX "OrganizationRuleAction_organizationRuleId_idx" ON "OrganizationRuleAction"("organizationRuleId");

-- CreateIndex
CREATE INDEX "Rule_organizationRuleId_idx" ON "Rule"("organizationRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "Rule_emailAccountId_organizationRuleId_key" ON "Rule"("emailAccountId", "organizationRuleId");

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_organizationRuleId_fkey" FOREIGN KEY ("organizationRuleId") REFERENCES "OrganizationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationRule" ADD CONSTRAINT "OrganizationRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationRuleAction" ADD CONSTRAINT "OrganizationRuleAction_organizationRuleId_fkey" FOREIGN KEY ("organizationRuleId") REFERENCES "OrganizationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
