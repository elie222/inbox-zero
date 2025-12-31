-- CreateTable
CREATE TABLE "RecipientProfile" (
    "id" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "detectedFormality" TEXT,
    "typicalGreeting" TEXT,
    "typicalSignoff" TEXT,
    "averageResponseLength" INTEGER,
    "communicationFrequency" INTEGER,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "lastAnalyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecipientProfile_emailAccountId_idx" ON "RecipientProfile"("emailAccountId");

-- CreateIndex
CREATE INDEX "RecipientProfile_recipientEmail_idx" ON "RecipientProfile"("recipientEmail");

-- CreateIndex
CREATE UNIQUE INDEX "RecipientProfile_emailAccountId_recipientEmail_key" ON "RecipientProfile"("emailAccountId", "recipientEmail");

-- AddForeignKey
ALTER TABLE "RecipientProfile" ADD CONSTRAINT "RecipientProfile_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
