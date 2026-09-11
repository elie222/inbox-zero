ALTER TABLE "Account" ADD COLUMN "password" TEXT;

-- AlterTable
ALTER TABLE "ssoProvider" ADD COLUMN     "userId" TEXT;

-- AddForeignKey
ALTER TABLE "ssoProvider" ADD CONSTRAINT "ssoProvider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Recover ownership only from the existing linked inbox, never by email.
UPDATE "ssoProvider" AS provider
SET "userId" = account."userId"
FROM "EmailAccount" AS account
WHERE provider."emailAccountId" = account.id;
