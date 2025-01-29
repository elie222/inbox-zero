-- CreateEnum
CREATE TYPE "GroupItemStatus" AS ENUM ('APPROVED', 'REJECTED', 'EVALUATE');

-- AlterTable
ALTER TABLE "GroupItem" ADD COLUMN     "status" "GroupItemStatus" NOT NULL DEFAULT 'APPROVED';
