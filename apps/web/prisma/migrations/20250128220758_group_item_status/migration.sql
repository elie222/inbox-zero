-- CreateEnum
CREATE TYPE "GroupItemStatus" AS ENUM ('APPROVED', 'REJECTED', 'NEEDS_AI');

-- AlterTable
ALTER TABLE "GroupItem" ADD COLUMN     "status" "GroupItemStatus" NOT NULL DEFAULT 'APPROVED';
