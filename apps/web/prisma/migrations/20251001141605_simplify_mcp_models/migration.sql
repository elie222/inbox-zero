/*
  Warnings:

  - You are about to drop the column `approvedScopes` on the `McpConnection` table. All the data in the column will be lost.
  - You are about to drop the column `approvedTools` on the `McpConnection` table. All the data in the column will be lost.
  - You are about to drop the column `organizationId` on the `McpConnection` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "McpConnection" DROP CONSTRAINT "McpConnection_organizationId_fkey";

-- DropIndex
DROP INDEX "McpConnection_emailAccountId_isActive_idx";

-- DropIndex
DROP INDEX "McpConnection_integrationId_idx";

-- DropIndex
DROP INDEX "McpConnection_organizationId_integrationId_key";

-- DropIndex
DROP INDEX "McpConnection_organizationId_isActive_idx";

-- AlterTable
ALTER TABLE "McpConnection" DROP COLUMN "approvedScopes",
DROP COLUMN "approvedTools",
DROP COLUMN "organizationId";
