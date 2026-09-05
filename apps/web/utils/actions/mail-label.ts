"use server";

import { runWithBoundedConcurrency } from "@/utils/async";
import { actionClient } from "@/utils/actions/safe-action";
import { applyThreadLabelsBody } from "@/utils/actions/mail-label.validation";
import { getGmailClientForEmail } from "@/utils/email-account-client";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { SafeError } from "@/utils/error";
import { labelThread } from "@/utils/gmail/label";

export const applyThreadLabelsAction = actionClient
  .metadata({ name: "applyThreadLabels" })
  .inputSchema(applyThreadLabelsBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { threadIds, labelId },
    }) => {
      if (!isGoogleProvider(provider)) {
        throw new SafeError("Manual labeling is available for Gmail accounts.");
      }
      const gmail = await getGmailClientForEmail({ emailAccountId, logger });
      const { data: label } = await gmail.users.labels.get({
        userId: "me",
        id: labelId,
      });
      if (label.type !== "user") {
        throw new SafeError("Select a user-created Gmail label.");
      }
      const targets = [...new Set(threadIds)];
      const results = await runWithBoundedConcurrency({
        items: targets,
        concurrency: 5,
        run: (threadId) =>
          labelThread({ gmail, threadId, addLabelIds: [labelId] }),
      });
      const succeededThreadIds: string[] = [];
      const failedThreadIds: string[] = [];
      for (const { item: threadId, result } of results) {
        if (result.status === "fulfilled") succeededThreadIds.push(threadId);
        else {
          failedThreadIds.push(threadId);
          logger.error("Failed to apply thread label", {
            error: result.reason,
          });
        }
      }
      return { succeededThreadIds, failedThreadIds };
    },
  );
