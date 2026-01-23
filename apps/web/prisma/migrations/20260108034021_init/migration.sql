-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "allowedPlugins" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "InstalledPlugin" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "versionType" TEXT NOT NULL DEFAULT 'release',
    "commitSha" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "catalogUrl" TEXT,
    "repositoryUrl" TEXT,

    CONSTRAINT "InstalledPlugin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginUserSettings" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "PluginUserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginAccountSettings" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "PluginAccountSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginCatalog" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSync" TIMESTAMP(3),

    CONSTRAINT "PluginCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstalledPlugin_pluginId_key" ON "InstalledPlugin"("pluginId");

-- CreateIndex
CREATE INDEX "PluginUserSettings_userId_idx" ON "PluginUserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PluginUserSettings_pluginId_userId_key" ON "PluginUserSettings"("pluginId", "userId");

-- CreateIndex
CREATE INDEX "PluginAccountSettings_emailAccountId_idx" ON "PluginAccountSettings"("emailAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PluginAccountSettings_pluginId_emailAccountId_key" ON "PluginAccountSettings"("pluginId", "emailAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PluginCatalog_url_key" ON "PluginCatalog"("url");

-- AddForeignKey
ALTER TABLE "PluginUserSettings" ADD CONSTRAINT "PluginUserSettings_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "InstalledPlugin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginUserSettings" ADD CONSTRAINT "PluginUserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginAccountSettings" ADD CONSTRAINT "PluginAccountSettings_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "InstalledPlugin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginAccountSettings" ADD CONSTRAINT "PluginAccountSettings_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
