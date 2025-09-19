/*
  Warnings:

  - You are about to drop the column `userId` on the `Member` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `ssoProvider` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[organizationId,emailAccountId]` on the table `Member` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `emailAccountId` to the `Member` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Member" DROP CONSTRAINT "Member_userId_fkey";

-- DropForeignKey
ALTER TABLE "invitation" DROP CONSTRAINT "invitation_inviterId_fkey";

-- DropForeignKey
ALTER TABLE "ssoProvider" DROP CONSTRAINT "ssoProvider_userId_fkey";

-- DropIndex
DROP INDEX "Member_organizationId_userId_key";

-- AlterTable
ALTER TABLE "Member" DROP COLUMN "userId",
ADD COLUMN     "emailAccountId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ssoProvider" DROP COLUMN "userId",
ADD COLUMN     "emailAccountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Member_organizationId_emailAccountId_key" ON "Member"("organizationId", "emailAccountId");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ssoProvider" ADD CONSTRAINT "ssoProvider_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Member_emailAccountId_idx" ON "Member"("emailAccountId");
