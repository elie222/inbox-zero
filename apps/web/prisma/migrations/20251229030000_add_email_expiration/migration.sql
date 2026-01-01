-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "expirationReason" TEXT,
ADD COLUMN     "expiredAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EmailExpirationSettings" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "notificationDays" INTEGER NOT NULL DEFAULT 7,
    "newsletterDays" INTEGER NOT NULL DEFAULT 30,
    "marketingDays" INTEGER NOT NULL DEFAULT 14,
    "socialDays" INTEGER NOT NULL DEFAULT 7,
    "calendarDays" INTEGER NOT NULL DEFAULT 1,
    "applyLabel" BOOLEAN NOT NULL DEFAULT true,
    "enabledCategories" TEXT[] DEFAULT ARRAY['NOTIFICATION', 'NEWSLETTER', 'MARKETING', 'SOCIAL', 'CALENDAR']::TEXT[],
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "EmailExpirationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpiredEmailLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "subject" TEXT,
    "from" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "expiredAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "ExpiredEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailExpirationSettings_emailAccountId_key" ON "EmailExpirationSettings"("emailAccountId");

-- CreateIndex
CREATE INDEX "ExpiredEmailLog_emailAccountId_createdAt_idx" ON "ExpiredEmailLog"("emailAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_emailAccountId_inbox_expiresAt_idx" ON "EmailMessage"("emailAccountId", "inbox", "expiresAt");

-- AddForeignKey
ALTER TABLE "EmailExpirationSettings" ADD CONSTRAINT "EmailExpirationSettings_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpiredEmailLog" ADD CONSTRAINT "ExpiredEmailLog_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
