CREATE TYPE "MailboxPushPlatform" AS ENUM ('ios');

CREATE TYPE "MailboxPushEnvironment" AS ENUM ('sandbox', 'production');

CREATE TABLE "MailboxPushDevice" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "MailboxPushPlatform" NOT NULL,
    "environment" "MailboxPushEnvironment" NOT NULL,
    "appVersion" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "MailboxPushDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MailboxPushDevice_token_emailAccountId_key" ON "MailboxPushDevice"("token", "emailAccountId");
CREATE INDEX "MailboxPushDevice_emailAccountId_idx" ON "MailboxPushDevice"("emailAccountId");
CREATE INDEX "MailboxPushDevice_userId_idx" ON "MailboxPushDevice"("userId");

ALTER TABLE "MailboxPushDevice"
ADD CONSTRAINT "MailboxPushDevice_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MailboxPushDevice"
ADD CONSTRAINT "MailboxPushDevice_emailAccountId_fkey"
FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
