CREATE TABLE "ComposeDraftSave" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "draftId" TEXT,
    "creationInput" JSONB NOT NULL,
    "legacyUnconfirmed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ComposeDraftSave_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ComposeDraftSave_emailAccountId_requestId_key" ON "ComposeDraftSave"("emailAccountId", "requestId");
ALTER TABLE "ComposeDraftSave" ADD CONSTRAINT "ComposeDraftSave_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
