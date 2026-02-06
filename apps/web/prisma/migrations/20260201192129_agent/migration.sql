-- CreateEnum
CREATE TYPE "TargetGroupCardinality" AS ENUM ('SINGLE', 'MULTI');

-- CreateEnum
CREATE TYPE "SkillStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'PENDING_APPROVAL', 'SUCCESS', 'FAILED', 'BLOCKED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ProviderResource" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "metadata" JSONB,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "ProviderResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllowedAction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "actionType" TEXT NOT NULL,
    "resourceType" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "conditions" JSONB,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "AllowedAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllowedActionOption" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "actionType" TEXT NOT NULL,
    "resourceType" TEXT,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "targetGroupId" TEXT,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "AllowedActionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cardinality" "TargetGroupCardinality" NOT NULL DEFAULT 'MULTI',
    "appliesToResourceType" TEXT,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "TargetGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnedPattern" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "matcher" JSONB NOT NULL,
    "matcherHash" TEXT NOT NULL,
    "reason" TEXT,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "LearnedPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatternAction" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "actionData" JSONB NOT NULL,
    "patternId" TEXT NOT NULL,

    CONSTRAINT "PatternAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "SkillStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastUsedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutedAgentAction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actionType" TEXT NOT NULL,
    "actionData" JSONB NOT NULL,
    "resourceId" TEXT,
    "threadId" TEXT,
    "messageSubject" TEXT,
    "status" "ExecutionStatus" NOT NULL,
    "error" TEXT,
    "triggeredBy" TEXT NOT NULL,
    "patternId" TEXT,
    "skillId" TEXT,
    "matchMetadata" JSONB,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "ExecutedAgentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionArtifact" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "artifactType" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT,
    "metadata" JSONB,
    "executedAgentActionId" TEXT NOT NULL,

    CONSTRAINT "ActionArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantDraft" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "draftId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "AssistantDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderResource_emailAccountId_provider_resourceType_exter_key" ON "ProviderResource"("emailAccountId", "provider", "resourceType", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "AllowedAction_emailAccountId_resourceType_actionType_key" ON "AllowedAction"("emailAccountId", "resourceType", "actionType");

-- CreateIndex
CREATE UNIQUE INDEX "AAO_email_action_resource_provider_kind_ext_key" ON "AllowedActionOption"("emailAccountId", "actionType", "resourceType", "provider", "kind", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "AAO_email_action_resource_provider_kind_name_key" ON "AllowedActionOption"("emailAccountId", "actionType", "resourceType", "provider", "kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TargetGroup_emailAccountId_name_key" ON "TargetGroup"("emailAccountId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "LearnedPattern_emailAccountId_provider_resourceType_matcher_key" ON "LearnedPattern"("emailAccountId", "provider", "resourceType", "matcherHash");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_emailAccountId_name_key" ON "Skill"("emailAccountId", "name");

-- CreateIndex
CREATE INDEX "ExecutedAgentAction_emailAccountId_createdAt_idx" ON "ExecutedAgentAction"("emailAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "ExecutedAgentAction_emailAccountId_status_idx" ON "ExecutedAgentAction"("emailAccountId", "status");

-- CreateIndex
CREATE INDEX "ExecutedAgentAction_triggeredBy_idx" ON "ExecutedAgentAction"("triggeredBy");

-- CreateIndex
CREATE INDEX "ActionArtifact_executedAgentActionId_idx" ON "ActionArtifact"("executedAgentActionId");

-- CreateIndex
CREATE INDEX "AssistantDraft_emailAccountId_threadId_idx" ON "AssistantDraft"("emailAccountId", "threadId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantDraft_emailAccountId_draftId_key" ON "AssistantDraft"("emailAccountId", "draftId");

-- AddForeignKey
ALTER TABLE "ProviderResource" ADD CONSTRAINT "ProviderResource_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllowedAction" ADD CONSTRAINT "AllowedAction_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllowedActionOption" ADD CONSTRAINT "AllowedActionOption_targetGroupId_fkey" FOREIGN KEY ("targetGroupId") REFERENCES "TargetGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllowedActionOption" ADD CONSTRAINT "AllowedActionOption_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetGroup" ADD CONSTRAINT "TargetGroup_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnedPattern" ADD CONSTRAINT "LearnedPattern_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatternAction" ADD CONSTRAINT "PatternAction_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "LearnedPattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutedAgentAction" ADD CONSTRAINT "ExecutedAgentAction_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionArtifact" ADD CONSTRAINT "ActionArtifact_executedAgentActionId_fkey" FOREIGN KEY ("executedAgentActionId") REFERENCES "ExecutedAgentAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantDraft" ADD CONSTRAINT "AssistantDraft_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ThreadTracker_emailAccountId_type_resolved_followUpAppliedAt_id" RENAME TO "ThreadTracker_emailAccountId_type_resolved_followUpAppliedA_idx";
