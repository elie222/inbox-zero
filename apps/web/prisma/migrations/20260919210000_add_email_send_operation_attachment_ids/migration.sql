ALTER TABLE "EmailSendOperation"
ADD COLUMN "attachmentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
