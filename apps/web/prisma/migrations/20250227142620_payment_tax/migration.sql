/*
  Warnings:

  - Added the required column `tax` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `taxInclusive` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "tax" INTEGER NOT NULL,
ADD COLUMN     "taxInclusive" BOOLEAN NOT NULL;
