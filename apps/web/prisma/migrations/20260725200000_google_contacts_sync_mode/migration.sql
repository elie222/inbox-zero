-- CreateEnum
CREATE TYPE "GoogleContactsSyncMode" AS ENUM ('OFF', 'PULL', 'TWO_WAY');

-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN "googleContactsSyncMode" "GoogleContactsSyncMode" NOT NULL DEFAULT 'OFF';

-- The old boolean's "on" was two-way (pull + push), so it maps to TWO_WAY
UPDATE "EmailAccount" SET "googleContactsSyncMode" = 'TWO_WAY' WHERE "googleContactsSyncEnabled" = true;

-- DropColumn
ALTER TABLE "EmailAccount" DROP COLUMN "googleContactsSyncEnabled";
