"use server";

import { after } from "next/server";
import { env } from "@/env";
import { actionClientUser } from "@/utils/actions/safe-action";
import { submitFeedbackBody } from "@/utils/actions/feedback.validation";
import type { Logger } from "@/utils/logger";
import { trackProductFeedback } from "@/utils/posthog";

export const submitFeedbackAction = actionClientUser
  .metadata({ name: "submitFeedback" })
  .inputSchema(submitFeedbackBody)
  .action(async ({ ctx: { userEmail, logger }, parsedInput: { feedback } }) => {
    await trackProductFeedback(userEmail, feedback);
    after(() => sendFeedbackToWebhook({ email: userEmail, feedback, logger }));

    return { success: true };
  });

async function sendFeedbackToWebhook({
  email,
  feedback,
  logger,
}: {
  email: string;
  feedback: string;
  logger: Logger;
}) {
  if (!env.FEEDBACK_WEBHOOK_URL) return;

  try {
    const response = await fetch(env.FEEDBACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        text: "New product feedback received",
        blocks: [
          {
            type: "section",
            text: { type: "plain_text", text: `User: ${email}` },
          },
          ...splitFeedbackForSlack(feedback).map((text) => ({
            type: "section",
            text: { type: "plain_text", text },
          })),
        ],
      }),
    });

    if (!response.ok) {
      logger.error("Failed to send product feedback webhook", {
        status: response.status,
      });
    }
  } catch (error) {
    logger.error("Failed to send product feedback webhook", { error });
  }
}

function splitFeedbackForSlack(feedback: string) {
  const sectionTextLimit = 3000;
  const sections: string[] = [];

  for (let index = 0; index < feedback.length; index += sectionTextLimit) {
    sections.push(feedback.slice(index, index + sectionTextLimit));
  }

  return sections;
}
