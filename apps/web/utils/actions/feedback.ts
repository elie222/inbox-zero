"use server";

import { actionClientUser } from "@/utils/actions/safe-action";
import { submitFeedbackBody } from "@/utils/actions/feedback.validation";
import { trackProductFeedback } from "@/utils/posthog";

export const submitFeedbackAction = actionClientUser
  .metadata({ name: "submitFeedback" })
  .inputSchema(submitFeedbackBody)
  .action(async ({ ctx: { userEmail }, parsedInput: { feedback } }) => {
    await trackProductFeedback(userEmail, feedback);

    return { success: true };
  });
