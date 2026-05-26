-- AlterTable
ALTER TABLE "DraftSendLog"
  ADD COLUMN "bodySimilarityScore" DOUBLE PRECISION,
  ADD COLUMN "bodySimilarityStatus" TEXT,
  ADD COLUMN "similarityMetadata" JSONB;
