import { NextResponse } from "next/server";
import { scheduledEmailIdBody } from "@/utils/actions/scheduled-email.validation";
import { withEmailAccount } from "@/utils/middleware";
import { cancelScheduledEmail } from "@/utils/scheduled-email/service";

export type CancelScheduledEmailResponse = { success: true };

export const DELETE = withEmailAccount(
  "user/scheduled-emails/cancel",
  async (request, context) => {
    const { id } = scheduledEmailIdBody.parse(await context.params);
    await cancelScheduledEmail(request.auth.emailAccountId, id);
    return NextResponse.json({
      success: true,
    } satisfies CancelScheduledEmailResponse);
  },
);
