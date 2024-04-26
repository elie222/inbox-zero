-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('AI', 'STATIC', 'GROUP');

-- AlterTable
ALTER TABLE "Rule" ADD COLUMN     "type" "RuleType" NOT NULL DEFAULT 'AI';
