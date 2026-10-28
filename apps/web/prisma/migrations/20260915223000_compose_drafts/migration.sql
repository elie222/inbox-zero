CREATE TABLE "ComposeDraft" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "draftId" TEXT,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "savingAt" TIMESTAMP(3),
    "attachmentsHash" TEXT,
    CONSTRAINT "ComposeDraft_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ComposeDraft_emailAccountId_sessionId_key" ON "ComposeDraft"("emailAccountId", "sessionId");
ALTER TABLE "ComposeDraft" ADD CONSTRAINT "ComposeDraft_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
