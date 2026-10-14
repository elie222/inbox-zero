-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "spamFilterEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SpamModel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IMPORTING',
    "sourceDigest" TEXT NOT NULL,
    "sourceMetadata" JSONB NOT NULL,
    "goodMessages" INTEGER NOT NULL,
    "spamMessages" INTEGER NOT NULL,
    "bias" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "tokenizerVersion" TEXT NOT NULL,
    "importedWords" INTEGER NOT NULL DEFAULT 0,
    "importedMessages" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpamModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpamToken" (
    "modelId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "lookupHash" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "good" INTEGER NOT NULL,
    "spam" INTEGER NOT NULL,
    "originalProbability" DOUBLE PRECISION,
    "originalLastUsed" DOUBLE PRECISION,

    CONSTRAINT "SpamToken_pkey" PRIMARY KEY ("modelId","hash")
);

-- CreateTable
CREATE TABLE "SpamHistoricalMessage" (
    "modelId" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "sourceData" JSONB NOT NULL,
    "rawMessage" BYTEA,

    CONSTRAINT "SpamHistoricalMessage_pkey" PRIMARY KEY ("modelId","sourceId")
);

-- CreateTable
CREATE TABLE "SpamTraining" (
    "emailAccountId" TEXT NOT NULL,
    "messageKey" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokens" JSONB NOT NULL,
    "tokenizerVersion" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpamTraining_pkey" PRIMARY KEY ("emailAccountId","messageKey")
);

-- CreateTable
CREATE TABLE "SpamDecision" (
    "emailAccountId" TEXT NOT NULL,
    "messageKey" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelRevision" INTEGER NOT NULL,
    "tokenizerVersion" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "verdict" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "warnings" TEXT[],
    "moveStartedAt" TIMESTAMP(3),
    "movedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpamDecision_pkey" PRIMARY KEY ("emailAccountId","messageKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpamModel_userId_key" ON "SpamModel"("userId");

-- CreateIndex
CREATE INDEX "SpamToken_modelId_lookupHash_idx" ON "SpamToken"("modelId", "lookupHash");

-- AddForeignKey
ALTER TABLE "SpamModel" ADD CONSTRAINT "SpamModel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpamToken" ADD CONSTRAINT "SpamToken_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "SpamModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpamHistoricalMessage" ADD CONSTRAINT "SpamHistoricalMessage_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "SpamModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpamTraining" ADD CONSTRAINT "SpamTraining_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpamTraining" ADD CONSTRAINT "SpamTraining_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "SpamModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpamDecision" ADD CONSTRAINT "SpamDecision_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpamDecision" ADD CONSTRAINT "SpamDecision_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "SpamModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "SpamToken" ADD CONSTRAINT "SpamToken_nonnegative" CHECK ("good" >= 0 AND "spam" >= 0);
ALTER TABLE "SpamModel" ADD CONSTRAINT "SpamModel_nonnegative" CHECK ("goodMessages" >= 0 AND "spamMessages" >= 0);
ALTER TABLE "SpamModel" ADD CONSTRAINT "SpamModel_threshold" CHECK ("threshold" > 0.5 AND "threshold" < 1);
ALTER TABLE "SpamTraining" ADD CONSTRAINT "SpamTraining_label" CHECK ("label" IN ('good', 'spam'));
