-- Drafts of already-disconnected accounts stop being AI draft cleanup candidates.
-- Mirrors getDraftCleanupCandidateWhere() in utils/ai/draft-cleanup.ts.
UPDATE "ExecutedAction" ea
SET "draftStatus" = 'CLEANUP_SKIPPED', "updatedAt" = NOW()
FROM "ExecutedRule" er
JOIN "EmailAccount" e ON e."id" = er."emailAccountId"
JOIN "Account" a ON a."id" = e."accountId"
WHERE ea."executedRuleId" = er."id"
  AND a."disconnectedAt" IS NOT NULL
  AND ea."draftId" IS NOT NULL
  AND ea."type" = 'DRAFT_EMAIL'
  AND (
    ea."draftStatus" IN ('PENDING', 'REPLIED_WITHOUT_DRAFT')
    OR ea."draftStatus" IS NULL
    OR (ea."draftStatus" = 'CLEANED_UP_UNUSED' AND ea."wasDraftSent" = false)
  );
