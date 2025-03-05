/*
  Warnings:

  - The `processorType` column on the `Payment` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "ProcessorType" AS ENUM ('LEMON_SQUEEZY');

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "processorType",
ADD COLUMN     "processorType" "ProcessorType" NOT NULL DEFAULT 'LEMON_SQUEEZY';
