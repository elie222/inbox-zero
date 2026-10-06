CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'STOPPED');
CREATE TYPE "ConversationActivityKind" AS ENUM ('INVITED', 'COMMENT', 'MENTION');

CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "generation" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationParticipant" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
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
    "authorMemberId" TEXT,
    "clientMutationId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationActivity" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "commentId" TEXT,
    "kind" "ConversationActivityKind" NOT NULL,
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Conversation_publisherId_threadId_key" ON "Conversation"("publisherId", "threadId");

CREATE INDEX "Conversation_organizationId_idx" ON "Conversation"("organizationId");

CREATE INDEX "ConversationParticipant_memberId_idx" ON "ConversationParticipant"("memberId");

CREATE UNIQUE INDEX "ConversationParticipant_conversationId_memberId_generation_key" ON "ConversationParticipant"("conversationId", "memberId", "generation");
CREATE UNIQUE INDEX "ConversationComment_conversationId_revision_key" ON "ConversationComment"("conversationId", "revision");

CREATE UNIQUE INDEX "ConversationComment_conversationId_authorMemberId_clientMut_key" ON "ConversationComment"("conversationId", "authorMemberId", "clientMutationId");

CREATE INDEX "ConversationActivity_participantId_createdAt_id_idx" ON "ConversationActivity"("participantId", "createdAt", "id");

CREATE UNIQUE INDEX "ConversationActivity_participantId_kind_revision_key" ON "ConversationActivity"("participantId", "kind", "revision");

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationComment" ADD CONSTRAINT "ConversationComment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationComment" ADD CONSTRAINT "ConversationComment_authorMemberId_fkey" FOREIGN KEY ("authorMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConversationActivity" ADD CONSTRAINT "ConversationActivity_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "ConversationParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationActivity" ADD CONSTRAINT "ConversationActivity_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ConversationComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
