-- CreateEnum
CREATE TYPE "LabelCleanupAction" AS ENUM ('REMOVE_LABEL', 'TRASH');

-- CreateTable
CREATE TABLE "LabelCleanup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "labelName" TEXT NOT NULL,
    "afterDays" INTEGER NOT NULL,
    "action" "LabelCleanupAction" NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastRunCount" INTEGER,

    CONSTRAINT "LabelCleanup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LabelCleanup_emailAccountId_labelId_key" ON "LabelCleanup"("emailAccountId", "labelId");

-- CreateIndex
CREATE INDEX "LabelCleanup_emailAccountId_idx" ON "LabelCleanup"("emailAccountId");

-- AddForeignKey
ALTER TABLE "LabelCleanup" ADD CONSTRAINT "LabelCleanup_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
