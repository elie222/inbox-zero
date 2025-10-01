/*
  Warnings:

  - You are about to drop the column `authType` on the `McpIntegration` table. All the data in the column will be lost.
  - You are about to drop the column `defaultScopes` on the `McpIntegration` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `McpIntegration` table. All the data in the column will be lost.
  - You are about to drop the column `displayName` on the `McpIntegration` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `McpIntegration` table. All the data in the column will be lost.
  - You are about to drop the column `npmPackage` on the `McpIntegration` table. All the data in the column will be lost.
  - You are about to drop the column `serverUrl` on the `McpIntegration` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "McpIntegration_isActive_idx";

-- DropIndex
DROP INDEX "McpTool_connectionId_idx";

-- AlterTable
ALTER TABLE "McpIntegration" DROP COLUMN "authType",
DROP COLUMN "defaultScopes",
DROP COLUMN "description",
DROP COLUMN "displayName",
DROP COLUMN "isActive",
DROP COLUMN "npmPackage",
DROP COLUMN "serverUrl",
ADD COLUMN     "registeredAuthorizationUrl" TEXT,
ADD COLUMN     "registeredServerUrl" TEXT,
ADD COLUMN     "registeredTokenUrl" TEXT;
