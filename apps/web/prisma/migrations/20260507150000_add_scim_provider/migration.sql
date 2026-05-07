-- CreateTable
CREATE TABLE "scimProvider" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "scimToken" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scimProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scimProvider_providerId_key" ON "scimProvider"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "scimProvider_scimToken_key" ON "scimProvider"("scimToken");

-- CreateIndex
CREATE INDEX "scimProvider_organizationId_idx" ON "scimProvider"("organizationId");

-- CreateIndex
CREATE INDEX "scimProvider_userId_idx" ON "scimProvider"("userId");

-- AddForeignKey
ALTER TABLE "scimProvider" ADD CONSTRAINT "scimProvider_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scimProvider" ADD CONSTRAINT "scimProvider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
