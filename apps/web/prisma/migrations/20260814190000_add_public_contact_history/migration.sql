CREATE TYPE "PublicContactSnapshotStatus" AS ENUM ('FOUND', 'NOT_FOUND');

CREATE TABLE "PublicContactSnapshot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "identityHash" TEXT NOT NULL,
    "status" "PublicContactSnapshotStatus" NOT NULL,
    "context" JSONB,
    "researchStartedAt" TIMESTAMP(3) NOT NULL,
    "refreshAfter" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicContactSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PublicContactSnapshot_status_context_check" CHECK (
        ("status" = 'FOUND' AND "context" IS NOT NULL) OR
        ("status" = 'NOT_FOUND' AND "context" IS NULL)
    )
);

CREATE INDEX "PublicContactSnapshot_latest_idx"
ON "PublicContactSnapshot"(
    "identityHash",
    "researchStartedAt" DESC,
    "createdAt" DESC,
    "id" DESC
);
