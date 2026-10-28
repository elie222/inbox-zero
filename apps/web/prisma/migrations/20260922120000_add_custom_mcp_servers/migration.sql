-- CreateEnum
CREATE TYPE "McpAuthType" AS ENUM ('OAUTH', 'API_TOKEN');

-- AlterTable
ALTER TABLE "McpIntegration" ADD COLUMN     "authType" "McpAuthType",
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "emailAccountId" TEXT,
ADD COLUMN     "serverUrl" TEXT;

-- CreateIndex
CREATE INDEX "McpIntegration_emailAccountId_idx" ON "McpIntegration"("emailAccountId");

-- AddForeignKey
ALTER TABLE "McpIntegration" ADD CONSTRAINT "McpIntegration_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
