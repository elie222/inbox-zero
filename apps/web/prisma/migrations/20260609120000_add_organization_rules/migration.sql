-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "Rule" ADD COLUMN     "organizationRuleId" TEXT;

-- CreateTable
CREATE TABLE "OrganizationTeam" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "OrganizationTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationRule" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "runOnThreads" BOOLEAN NOT NULL DEFAULT false,
    "conditionalOperator" "LogicalOperator" NOT NULL DEFAULT 'AND',
    "instructions" TEXT,
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

    CONSTRAINT "OrganizationRuleAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_OrganizationRuleToOrganizationTeam" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_OrganizationRuleToOrganizationTeam_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTeam_organizationId_name_key" ON "OrganizationTeam"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationRule_organizationId_name_key" ON "OrganizationRule"("organizationId", "name");

-- CreateIndex
CREATE INDEX "OrganizationRuleAction_organizationRuleId_idx" ON "OrganizationRuleAction"("organizationRuleId");

-- CreateIndex
CREATE INDEX "_OrganizationRuleToOrganizationTeam_B_index" ON "_OrganizationRuleToOrganizationTeam"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Rule_organizationRuleId_emailAccountId_key" ON "Rule"("organizationRuleId", "emailAccountId");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "OrganizationTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationTeam" ADD CONSTRAINT "OrganizationTeam_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationRule" ADD CONSTRAINT "OrganizationRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationRuleAction" ADD CONSTRAINT "OrganizationRuleAction_organizationRuleId_fkey" FOREIGN KEY ("organizationRuleId") REFERENCES "OrganizationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_organizationRuleId_fkey" FOREIGN KEY ("organizationRuleId") REFERENCES "OrganizationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OrganizationRuleToOrganizationTeam" ADD CONSTRAINT "_OrganizationRuleToOrganizationTeam_A_fkey" FOREIGN KEY ("A") REFERENCES "OrganizationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OrganizationRuleToOrganizationTeam" ADD CONSTRAINT "_OrganizationRuleToOrganizationTeam_B_fkey" FOREIGN KEY ("B") REFERENCES "OrganizationTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

