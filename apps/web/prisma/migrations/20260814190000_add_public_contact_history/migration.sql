CREATE TABLE "ContactResearch" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "researchStartedAt" TIMESTAMP(3) NOT NULL,
    "found" BOOLEAN NOT NULL,
    "role" TEXT,
    "confidence" TEXT,
    "company" JSONB,
    "sources" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "ContactResearch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactResearch_latest_idx"
ON "ContactResearch"(
    "email",
    "researchStartedAt" DESC,
    "createdAt" DESC,
    "id" DESC
);
