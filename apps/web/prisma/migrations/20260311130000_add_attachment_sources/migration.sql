CREATE TYPE "AttachmentSourceType" AS ENUM ('FILE', 'FOLDER');

CREATE TABLE "AttachmentSource" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AttachmentSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourcePath" TEXT,
    "ruleId" TEXT NOT NULL,
    "driveConnectionId" TEXT NOT NULL,

    CONSTRAINT "AttachmentSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttachmentDocument" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "attachmentSourceId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "modifiedAt" TIMESTAMP(3),
    "summary" TEXT,
    "content" TEXT,
    "metadata" JSONB,
    "indexedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "AttachmentDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttachmentSource_ruleId_driveConnectionId_type_sourceId_key"
ON "AttachmentSource"("ruleId", "driveConnectionId", "type", "sourceId");

CREATE INDEX "AttachmentSource_ruleId_idx" ON "AttachmentSource"("ruleId");
CREATE INDEX "AttachmentSource_driveConnectionId_idx" ON "AttachmentSource"("driveConnectionId");

CREATE UNIQUE INDEX "AttachmentDocument_attachmentSourceId_fileId_key"
ON "AttachmentDocument"("attachmentSourceId", "fileId");

CREATE INDEX "AttachmentDocument_attachmentSourceId_modifiedAt_idx"
ON "AttachmentDocument"("attachmentSourceId", "modifiedAt");

ALTER TABLE "AttachmentSource"
ADD CONSTRAINT "AttachmentSource_ruleId_fkey"
FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AttachmentSource"
ADD CONSTRAINT "AttachmentSource_driveConnectionId_fkey"
FOREIGN KEY ("driveConnectionId") REFERENCES "DriveConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AttachmentDocument"
ADD CONSTRAINT "AttachmentDocument_attachmentSourceId_fkey"
FOREIGN KEY ("attachmentSourceId") REFERENCES "AttachmentSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
