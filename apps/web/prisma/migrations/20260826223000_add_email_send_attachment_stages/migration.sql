-- Existing PROCESSING rows may already have crossed the provider boundary.
-- Backfill them conservatively before new sends start using a nullable marker
-- for the attachment-preparation phase.
ALTER TABLE "EmailSendOperation" ADD COLUMN "providerStartedAt" TIMESTAMP(3);
UPDATE "EmailSendOperation"
SET "providerStartedAt" = "processingStartedAt";

-- CreateEnum
CREATE TYPE "EmailSendAttachmentStageStatus" AS ENUM ('PENDING', 'READY', 'DELETE_PENDING', 'DELETED');

-- CreateTable
CREATE TABLE "EmailSendAttachmentStage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "mutationId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "disposition" TEXT NOT NULL,
    "contentId" TEXT,
    "status" "EmailSendAttachmentStageStatus" NOT NULL DEFAULT 'PENDING',
    "etag" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "EmailSendAttachmentStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailSendAttachmentStage_pathname_key" ON "EmailSendAttachmentStage"("pathname");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSendStage_account_mutation_attachment_key" ON "EmailSendAttachmentStage"("emailAccountId", "mutationId", "attachmentId");

-- CreateIndex
CREATE INDEX "EmailSendAttachmentStage_emailAccountId_mutationId_idx" ON "EmailSendAttachmentStage"("emailAccountId", "mutationId");

-- CreateIndex
CREATE INDEX "EmailSendAttachmentStage_status_expiresAt_idx" ON "EmailSendAttachmentStage"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "EmailSendAttachmentStage_status_updatedAt_idx" ON "EmailSendAttachmentStage"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "EmailSendAttachmentStage" ADD CONSTRAINT "EmailSendAttachmentStage_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep the reservation state machine in one database transaction without an
-- interactive Prisma transaction. The account-scoped advisory lock makes the
-- live-byte quota exact across concurrent workers.
CREATE FUNCTION "reserveEmailSendAttachmentStages"(
    p_account_id TEXT,
    p_client_mutation_id TEXT,
    p_reservation_time TIMESTAMP(3),
    p_stale_before TIMESTAMP(3),
    p_stage_expires_at TIMESTAMP(3),
    p_attachment_input JSONB,
    p_maximum_live_stages INTEGER,
    p_maximum_live_bytes BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
    "operationId" TEXT;
    "operationStatus" "EmailSendOperationStatus";
    processing_started_at_value TIMESTAMP(3);
    provider_started_at_value TIMESTAMP(3);
    "operationFound" BOOLEAN := FALSE;
    "operationIsTerminal" BOOLEAN := FALSE;
    "affectedRows" INTEGER := 0;
    "existingCount" INTEGER := 0;
    "inputCount" INTEGER := 0;
    "distinctInputCount" INTEGER := 0;
    "additionCount" INTEGER := 0;
    "additionBytes" BIGINT := 0;
    "liveCount" BIGINT := 0;
    "liveBytes" BIGINT := 0;
    "cleanupIds" TEXT[] := ARRAY[]::TEXT[];
    "recoverPendingIds" TEXT[] := ARRAY[]::TEXT[];
    "stageIds" TEXT[] := ARRAY[]::TEXT[];
    "attachment" JSONB;
    "existingStageId" TEXT;
    "existingStageStatus" "EmailSendAttachmentStageStatus";
    "existingStageFound" BOOLEAN;
BEGIN
    PERFORM pg_advisory_xact_lock(814237, hashtext(p_account_id));

    SELECT
        operation."id",
        operation."status",
        operation."processingStartedAt",
        operation."providerStartedAt"
    INTO
        "operationId",
        "operationStatus",
        processing_started_at_value,
        provider_started_at_value
    FROM "EmailSendOperation" AS operation
    WHERE operation."emailAccountId" = p_account_id
      AND operation."clientMutationId" = p_client_mutation_id
    FOR UPDATE;
    "operationFound" := FOUND;

    IF "operationFound"
       AND "operationStatus" = 'PROCESSING'
       AND processing_started_at_value <= p_stale_before THEN
        IF provider_started_at_value IS NULL THEN
            DELETE FROM "EmailSendOperation"
            WHERE "id" = "operationId"
              AND "status" = 'PROCESSING'
              AND "providerStartedAt" IS NULL;
            GET DIAGNOSTICS "affectedRows" = ROW_COUNT;
            IF "affectedRows" > 0 THEN
                "operationFound" := FALSE;
                "operationStatus" := NULL;
            END IF;
        ELSE
            UPDATE "EmailSendOperation"
            SET
                "status" = 'UNCERTAIN',
                "updatedAt" = p_reservation_time
            WHERE "id" = "operationId"
              AND "status" = 'PROCESSING'
              AND "providerStartedAt" IS NOT NULL;
            GET DIAGNOSTICS "affectedRows" = ROW_COUNT;
            IF "affectedRows" > 0 THEN
                "operationStatus" := 'UNCERTAIN';
            END IF;
        END IF;
    END IF;

    "operationIsTerminal" := "operationFound" AND
        "operationStatus" IN ('SENT', 'UNCERTAIN');

    SELECT COUNT(*)::INTEGER
    INTO "existingCount"
    FROM "EmailSendAttachmentStage"
    WHERE "emailAccountId" = p_account_id
      AND "mutationId" = p_client_mutation_id;

    SELECT
        COUNT(*)::INTEGER,
        COUNT(DISTINCT input.value->>'id')::INTEGER
    INTO "inputCount", "distinctInputCount"
    FROM jsonb_array_elements(p_attachment_input) AS input(value);

    IF "inputCount" <> "distinctInputCount"
       OR (
           "existingCount" > 0
           AND (
               "existingCount" <> "inputCount"
               OR EXISTS (
                   SELECT 1
                   FROM jsonb_array_elements(p_attachment_input) AS input(value)
                   WHERE NOT EXISTS (
                       SELECT 1
                       FROM "EmailSendAttachmentStage" AS stage
                       WHERE stage."emailAccountId" = p_account_id
                         AND stage."mutationId" = p_client_mutation_id
                         AND stage."attachmentId" = input.value->>'id'
                   )
               )
           )
       ) THEN
        RETURN jsonb_build_object('outcome', 'attachment_set_changed');
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "EmailSendAttachmentStage" AS stage
        JOIN jsonb_array_elements(p_attachment_input) AS input(value)
          ON stage."attachmentId" = input.value->>'id'
        WHERE stage."emailAccountId" = p_account_id
          AND stage."mutationId" = p_client_mutation_id
          AND (
              stage."filename" IS DISTINCT FROM input.value->>'filename'
              OR LOWER(stage."mimeType") IS DISTINCT FROM LOWER(input.value->>'mimeType')
              OR stage."size" IS DISTINCT FROM (input.value->>'size')::INTEGER
              OR stage."disposition" IS DISTINCT FROM input.value->>'disposition'
              OR stage."contentId" IS DISTINCT FROM input.value->>'contentId'
          )
    ) THEN
        RETURN jsonb_build_object('outcome', 'metadata_changed');
    END IF;

    IF "operationIsTerminal" AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_attachment_input) AS input(value)
        WHERE NOT EXISTS (
            SELECT 1
            FROM "EmailSendAttachmentStage" AS stage
            WHERE stage."emailAccountId" = p_account_id
              AND stage."mutationId" = p_client_mutation_id
              AND stage."attachmentId" = input.value->>'id'
        )
    ) THEN
        RETURN jsonb_build_object('outcome', 'terminal_metadata_missing');
    END IF;

    SELECT COALESCE(ARRAY_AGG(stage."id" ORDER BY stage."createdAt"), ARRAY[]::TEXT[])
    INTO "cleanupIds"
    FROM "EmailSendAttachmentStage" AS stage
    WHERE NOT "operationIsTerminal"
      AND stage."emailAccountId" = p_account_id
      AND stage."mutationId" = p_client_mutation_id
      AND (
          stage."status" = 'DELETE_PENDING'
          OR (
              stage."status" <> 'DELETED'
              AND stage."expiresAt" <= p_reservation_time
          )
      );

    SELECT
        COUNT(*)::INTEGER,
        COALESCE(SUM((input.value->>'size')::BIGINT), 0)
    INTO "additionCount", "additionBytes"
    FROM jsonb_array_elements(p_attachment_input) AS input(value)
    LEFT JOIN "EmailSendAttachmentStage" AS stage
      ON stage."emailAccountId" = p_account_id
     AND stage."mutationId" = p_client_mutation_id
     AND stage."attachmentId" = input.value->>'id'
    WHERE stage."id" IS NULL
       OR (NOT "operationIsTerminal" AND stage."status" = 'DELETED');

    IF "operationFound"
       AND "operationStatus" = 'PROCESSING'
       AND (
           CARDINALITY("cleanupIds") > 0
           OR "additionCount" > 0
       ) THEN
        RETURN jsonb_build_object('outcome', 'operation_processing');
    END IF;

    IF CARDINALITY("cleanupIds") > 0 THEN
        UPDATE "EmailSendAttachmentStage"
        SET
            "status" = 'DELETE_PENDING',
            "updatedAt" = p_reservation_time
        WHERE "id" = ANY("cleanupIds");

        RETURN jsonb_build_object(
            'outcome', 'cleanup_required',
            'cleanupIds', to_jsonb("cleanupIds")
        );
    END IF;

    SELECT
        COUNT(*)::BIGINT,
        COALESCE(SUM(stage."size")::BIGINT, 0)
    INTO "liveCount", "liveBytes"
    FROM "EmailSendAttachmentStage" AS stage
    WHERE stage."emailAccountId" = p_account_id
      AND stage."status" IN ('PENDING', 'READY')
      AND stage."expiresAt" > p_reservation_time;

    IF "liveCount" + "additionCount" > p_maximum_live_stages
       OR "liveBytes" + "additionBytes" > p_maximum_live_bytes THEN
        RETURN jsonb_build_object('outcome', 'quota_exceeded');
    END IF;

    SELECT COALESCE(ARRAY_AGG(stage."id"), ARRAY[]::TEXT[])
    INTO "recoverPendingIds"
    FROM "EmailSendAttachmentStage" AS stage
    WHERE stage."emailAccountId" = p_account_id
      AND stage."mutationId" = p_client_mutation_id
      AND stage."status" = 'PENDING';

    FOR "attachment" IN
        SELECT input.value
        FROM jsonb_array_elements(p_attachment_input) WITH ORDINALITY AS input(value, ordinal)
        ORDER BY input.ordinal
    LOOP
        "existingStageId" := NULL;
        "existingStageStatus" := NULL;

        SELECT stage."id", stage."status"
        INTO "existingStageId", "existingStageStatus"
        FROM "EmailSendAttachmentStage" AS stage
        WHERE stage."emailAccountId" = p_account_id
          AND stage."mutationId" = p_client_mutation_id
          AND stage."attachmentId" = "attachment"->>'id';
        "existingStageFound" := FOUND;

        IF "existingStageFound" THEN
            IF NOT "operationIsTerminal" AND "existingStageStatus" = 'DELETED' THEN
                UPDATE "EmailSendAttachmentStage"
                SET
                    "pathname" = "attachment"->>'pathname',
                    "status" = 'PENDING',
                    "etag" = NULL,
                    "deletedAt" = NULL,
                    "expiresAt" = p_stage_expires_at,
                    "updatedAt" = p_reservation_time
                WHERE "id" = "existingStageId";
            END IF;
            "stageIds" := ARRAY_APPEND("stageIds", "existingStageId");
        ELSE
            INSERT INTO "EmailSendAttachmentStage" (
                "id",
                "createdAt",
                "updatedAt",
                "mutationId",
                "attachmentId",
                "pathname",
                "filename",
                "mimeType",
                "size",
                "disposition",
                "contentId",
                "status",
                "expiresAt",
                "emailAccountId"
            ) VALUES (
                "attachment"->>'stageId',
                p_reservation_time,
                p_reservation_time,
                p_client_mutation_id,
                "attachment"->>'id',
                "attachment"->>'pathname',
                "attachment"->>'filename',
                "attachment"->>'mimeType',
                ("attachment"->>'size')::INTEGER,
                "attachment"->>'disposition',
                "attachment"->>'contentId',
                'PENDING',
                p_stage_expires_at,
                p_account_id
            );
            "stageIds" := ARRAY_APPEND("stageIds", "attachment"->>'stageId');
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'outcome', 'reserved',
        'operationIsTerminal', "operationIsTerminal",
        'recoverPendingIds', to_jsonb("recoverPendingIds"),
        'stageIds', to_jsonb("stageIds")
    );
END;
$$;
