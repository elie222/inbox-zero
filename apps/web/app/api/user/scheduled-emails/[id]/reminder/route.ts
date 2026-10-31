import { NextResponse } from "next/server";
import { scheduledEmailIdBody } from "@/utils/actions/scheduled-email.validation";
import { withEmailAccount } from "@/utils/middleware";
import { cancelEmailReminder } from "@/utils/scheduled-email/service";

export type CancelEmailReminderResponse = { success: true };

export const DELETE = withEmailAccount(
  "user/scheduled-emails/reminder",
  async (request, context) => {
    const { id } = scheduledEmailIdBody.parse(await context.params);
    await cancelEmailReminder(request.auth.emailAccountId, id);
    return NextResponse.json({
      success: true,
    } satisfies CancelEmailReminderResponse);
  },
);
