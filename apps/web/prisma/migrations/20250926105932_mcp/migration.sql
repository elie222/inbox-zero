-- CreateTable
CREATE TABLE "McpIntegration" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "serverUrl" TEXT,
    "npmPackage" TEXT,
    "authType" TEXT NOT NULL,
    "defaultScopes" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "McpIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpConnection" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "integrationId" TEXT NOT NULL,
    "emailAccountId" TEXT,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "apiKey" TEXT,
    "expiresAt" TIMESTAMP(3),
    "approvedScopes" TEXT[],
    "approvedTools" TEXT[],

    CONSTRAINT "McpConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpTool" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "connectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "schema" JSONB,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "McpTool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpIntegration_name_key" ON "McpIntegration"("name");

-- CreateIndex
CREATE INDEX "McpIntegration_isActive_idx" ON "McpIntegration"("isActive");

-- CreateIndex
CREATE INDEX "McpConnection_integrationId_idx" ON "McpConnection"("integrationId");

-- CreateIndex
CREATE INDEX "McpConnection_emailAccountId_isActive_idx" ON "McpConnection"("emailAccountId", "isActive");

-- CreateIndex
CREATE INDEX "McpConnection_organizationId_isActive_idx" ON "McpConnection"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "McpConnection_emailAccountId_integrationId_key" ON "McpConnection"("emailAccountId", "integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "McpConnection_organizationId_integrationId_key" ON "McpConnection"("organizationId", "integrationId");

-- CreateIndex
CREATE INDEX "McpTool_connectionId_idx" ON "McpTool"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "McpTool_connectionId_name_key" ON "McpTool"("connectionId", "name");

-- AddForeignKey
ALTER TABLE "McpConnection" ADD CONSTRAINT "McpConnection_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "McpIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpConnection" ADD CONSTRAINT "McpConnection_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpConnection" ADD CONSTRAINT "McpConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpTool" ADD CONSTRAINT "McpTool_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "McpConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
