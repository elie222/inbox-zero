-- CreateEnum
CREATE TYPE "LogicalOperator" AS ENUM ('AND', 'OR');

-- AlterEnum
ALTER TYPE "RuleType" ADD VALUE 'CATEGORY';

-- AlterTable
ALTER TABLE "Rule" ADD COLUMN     "typeLogic" "LogicalOperator" NOT NULL DEFAULT 'AND',
ALTER COLUMN "instructions" DROP NOT NULL;
