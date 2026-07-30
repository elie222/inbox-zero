-- Resolved company logos cached across deploys
CREATE TABLE "CachedLogo" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "domain" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "body" BYTEA,
    "contentType" TEXT,
    "provider" TEXT,

    CONSTRAINT "CachedLogo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CachedLogo_domain_source_key" ON "CachedLogo"("domain", "source");
