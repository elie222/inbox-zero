-- CreateTable
CREATE TABLE "McpIntegration" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "registeredServerUrl" TEXT,
    "registeredAuthorizationUrl" TEXT,
    "registeredTokenUrl" TEXT,
    "oauthClientId" TEXT,
    "oauthClientSecret" TEXT,

    CONSTRAINT "McpIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpConnection" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "apiKey" TEXT,
    "expiresAt" TIMESTAMP(3),
    "integrationId" TEXT NOT NULL,
    "emailAccountId" TEXT,

    CONSTRAINT "McpConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpTool" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "schema" JSONB,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "connectionId" TEXT NOT NULL,

    CONSTRAINT "McpTool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpIntegration_name_key" ON "McpIntegration"("name");

-- CreateIndex
CREATE UNIQUE INDEX "McpConnection_emailAccountId_integrationId_key" ON "McpConnection"("emailAccountId", "integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "McpTool_connectionId_name_key" ON "McpTool"("connectionId", "name");

-- AddForeignKey
ALTER TABLE "McpConnection" ADD CONSTRAINT "McpConnection_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "McpIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpConnection" ADD CONSTRAINT "McpConnection_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpTool" ADD CONSTRAINT "McpTool_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "McpConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
