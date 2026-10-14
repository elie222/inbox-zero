CREATE TABLE "ICloudConnection" (
  "emailAccountId" TEXT NOT NULL PRIMARY KEY,
  "username" TEXT NOT NULL,
  "encryptedPassword" TEXT NOT NULL,
  "folders" JSONB NOT NULL,
  CONSTRAINT "ICloudConnection_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "ICloudMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "emailAccountId" TEXT NOT NULL,
  "folder" TEXT NOT NULL,
  "uidValidity" TEXT NOT NULL,
  "uid" INTEGER NOT NULL,
  "threadId" TEXT NOT NULL,
  "rootMessageId" TEXT,
  "moveDestination" TEXT,
  "moveUid" INTEGER,
  "moveUidValidity" TEXT,
  "messageIdHeader" TEXT,
  "internalDate" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ICloudMessage_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ICloudMessage_emailAccountId_folder_uidValidity_uid_key" ON "ICloudMessage"("emailAccountId", "folder", "uidValidity", "uid");
CREATE INDEX "ICloudMessage_emailAccountId_threadId_idx" ON "ICloudMessage"("emailAccountId", "threadId");
CREATE INDEX "ICloudMessage_emailAccountId_folder_deletedAt_idx" ON "ICloudMessage"("emailAccountId", "folder", "deletedAt");
