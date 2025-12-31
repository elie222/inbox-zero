import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { generatePreDraftsForAccount } from "@/utils/pre-drafts/generate-pre-drafts";

/**
 * POST /api/pre-drafts/generate
 * Triggers pre-draft generation for an email account.
 * Can be called manually or via QStash scheduled job.
 */
export const POST = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;

  const results = await generatePreDraftsForAccount(emailAccountId);

  return NextResponse.json({
    success: true,
    results,
    summary: {
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    },
  });
});
