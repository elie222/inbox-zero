-- Add a transient status used to claim an attachment before expensive filing work.
ALTER TYPE "DocumentFilingStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

-- Keep the newest row for each attachment before enforcing one filing per attachment.
WITH ranked_filings AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "emailAccountId", "messageId", "attachmentId"
            ORDER BY
                CASE "status"
                    WHEN 'FILED' THEN 1
                    WHEN 'PENDING' THEN 2
                    WHEN 'PREVIEW' THEN 3
                    WHEN 'ERROR' THEN 4
                    WHEN 'REJECTED' THEN 5
                    ELSE 6
                END,
                "createdAt" DESC,
                "id" DESC
        ) AS row_number
    FROM "DocumentFiling"
)
DELETE FROM "DocumentFiling"
WHERE "id" IN (
    SELECT "id"
    FROM ranked_filings
    WHERE row_number > 1
);

CREATE UNIQUE INDEX "DocumentFiling_emailAccountId_messageId_attachmentId_key"
ON "DocumentFiling"("emailAccountId", "messageId", "attachmentId");
