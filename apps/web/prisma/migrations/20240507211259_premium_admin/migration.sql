-- AlterTable
ALTER TABLE "User" ADD COLUMN     "premiumAdminId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_premiumAdminId_fkey" FOREIGN KEY ("premiumAdminId") REFERENCES "Premium"("id") ON DELETE SET NULL ON UPDATE CASCADE;
