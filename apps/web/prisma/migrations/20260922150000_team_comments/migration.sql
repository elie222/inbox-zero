CREATE TYPE "SharedConversationStatus" AS ENUM ('ACTIVE', 'STOPPED');
CREATE TYPE "ConversationActivityKind" AS ENUM ('INVITED', 'COMMENT', 'MENTION');

CREATE TABLE "SharedConversation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "publisherEmailAccountId" TEXT,
    "publisherAccountIdentityId" TEXT NOT NULL,
    "publisherMemberId" TEXT,
    "providerConversationId" TEXT NOT NULL,
    "status" "SharedConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "generation" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "SharedConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationParticipant" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "memberId" TEXT,
    "memberIdentityId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "readRevision" INTEGER NOT NULL DEFAULT 0,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationComment" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorMemberId" TEXT,
    "authorIdentityId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mentionedMemberIdentityIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "revision" INTEGER NOT NULL,
    "generation" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationMutationReceipt" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "actorIdentityId" TEXT NOT NULL,
    "clientMutationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "resultKind" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationMutationReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationActivity" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "commentId" TEXT,
    "kind" "ConversationActivityKind" NOT NULL,
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SharedConversation_organizationId_publisherAccountIdentityId_pro_key" ON "SharedConversation"("organizationId", "publisherAccountIdentityId", "providerConversationId");
CREATE INDEX "SharedConversation_publisherMemberId_status_idx" ON "SharedConversation"("publisherMemberId", "status");
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_memberIdentityId_generat_key" ON "ConversationParticipant"("conversationId", "memberIdentityId", "generation");
CREATE INDEX "ConversationParticipant_memberId_active_generation_idx" ON "ConversationParticipant"("memberId", "active", "generation");
CREATE UNIQUE INDEX "ConversationComment_conversationId_revision_key" ON "ConversationComment"("conversationId", "revision");
CREATE INDEX "ConversationComment_conversationId_createdAt_id_idx" ON "ConversationComment"("conversationId", "createdAt", "id");
CREATE UNIQUE INDEX "ConversationMutationReceipt_conversationId_actorIdentityId_key" ON "ConversationMutationReceipt"("conversationId", "actorIdentityId", "clientMutationId");
CREATE UNIQUE INDEX "ConversationActivity_participantId_kind_revision_key" ON "ConversationActivity"("participantId", "kind", "revision");
CREATE INDEX "ConversationActivity_participantId_createdAt_id_idx" ON "ConversationActivity"("participantId", "createdAt", "id");

ALTER TABLE "SharedConversation" ADD CONSTRAINT "SharedConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SharedConversation" ADD CONSTRAINT "SharedConversation_publisherEmailAccountId_fkey" FOREIGN KEY ("publisherEmailAccountId") REFERENCES "EmailAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SharedConversation" ADD CONSTRAINT "SharedConversation_publisherMemberId_fkey" FOREIGN KEY ("publisherMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SharedConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationComment" ADD CONSTRAINT "ConversationComment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SharedConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationComment" ADD CONSTRAINT "ConversationComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationComment" ADD CONSTRAINT "ConversationComment_authorMemberId_fkey" FOREIGN KEY ("authorMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationMutationReceipt" ADD CONSTRAINT "ConversationMutationReceipt_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SharedConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationActivity" ADD CONSTRAINT "ConversationActivity_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SharedConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationActivity" ADD CONSTRAINT "ConversationActivity_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "ConversationParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationActivity" ADD CONSTRAINT "ConversationActivity_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ConversationComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
