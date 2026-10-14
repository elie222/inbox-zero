-- CreateTable
CREATE TABLE "LoopsEmailSource" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailMessageId" TEXT,
    "loopId" TEXT,
    "loopName" TEXT,
    "campaignId" TEXT,
    "campaignName" TEXT,
    "sourceType" TEXT,
    "eventTime" TIMESTAMP(3),

    CONSTRAINT "LoopsEmailSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoopsEmailSource_emailMessageId_key" ON "LoopsEmailSource"("emailMessageId");

-- CreateIndex
CREATE INDEX "LoopsEmailSource_loopId_idx" ON "LoopsEmailSource"("loopId");

-- CreateIndex
CREATE INDEX "LoopsEmailSource_campaignId_idx" ON "LoopsEmailSource"("campaignId");

-- One unversioned row per workflow or campaign, so a name learned without an
-- email version cannot overwrite a version-specific row.
CREATE UNIQUE INDEX "LoopsEmailSource_loopId_unversioned_key"
ON "LoopsEmailSource"("loopId")
WHERE "emailMessageId" IS NULL AND "loopId" IS NOT NULL;

CREATE UNIQUE INDEX "LoopsEmailSource_campaignId_unversioned_key"
ON "LoopsEmailSource"("campaignId")
WHERE "emailMessageId" IS NULL AND "campaignId" IS NOT NULL;
