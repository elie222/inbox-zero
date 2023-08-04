-- AlterTable
ALTER TABLE "Rule" ADD COLUMN     "name" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Rule_name_userId_key" ON "Rule"("name", "userId");
