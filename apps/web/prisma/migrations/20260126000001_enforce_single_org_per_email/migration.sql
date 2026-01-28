-- CreateIndex
CREATE UNIQUE INDEX "Member_emailAccountId_key" ON "Member"("emailAccountId");

-- DropIndex
DROP INDEX "Member_emailAccountId_idx";
