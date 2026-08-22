DROP INDEX "ssoProvider_organizationId_idx";

CREATE UNIQUE INDEX "ssoProvider_organizationId_key"
ON "ssoProvider"("organizationId");
