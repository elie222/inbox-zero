import { NextResponse } from "next/server";
import { scheduledEmailIdBody } from "@/utils/actions/scheduled-email.validation";
import { withEmailAccount } from "@/utils/middleware";
import { retryScheduledEmail } from "@/utils/scheduled-email/service";

export type RetryScheduledEmailResponse = { success: true };

export const POST = withEmailAccount(
  "user/scheduled-emails/retry",
  async (request, context) => {
    const { id } = scheduledEmailIdBody.parse(await context.params);
    await retryScheduledEmail(request.auth.emailAccountId, id);
    return NextResponse.json({
      success: true,
    } satisfies RetryScheduledEmailResponse);
  },
);
