"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import prisma from "@/utils/prisma";
import { aiFindReplyTrackingRule } from "@/utils/ai/reply/check-reply-tracking";
import { safeCreateRule } from "@/utils/rule/rule";
import { ActionType } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import { NEEDS_REPLY_LABEL_NAME } from "@/utils/reply-tracker/consts";
import { getGmailClient } from "@/utils/gmail/client";
import { processPreviousSentEmails } from "@/utils/reply-tracker/check-previous-emails";
import {
  startAnalyzingReplyTracker,
  stopAnalyzingReplyTracker,
} from "@/utils/redis/reply-tracker-analyzing";

const logger = createScopedLogger("enableReplyTracker");

export const enableReplyTrackerAction = withActionInstrumentation(
  "enableReplyTracker",
  async () => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    // If enabled already skip
    const existingRule = await prisma.rule.findUnique({
      where: { id: userId, trackReplies: true },
    });

    if (existingRule) return { success: true };

    // Find existing reply required rule, make it track replies
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
        rulesPrompt: true,
        rules: {
          select: {
            id: true,
            instructions: true,
            actions: {
              select: {
                id: true,
                type: true,
                label: true,
              },
            },
          },
        },
      },
    });

    if (!user) return { error: "User not found" };

    const result = user.rules.length
      ? await aiFindReplyTrackingRule({
          rules: user.rules,
          user,
        })
      : null;

    const rule = user.rules.find((r) => r.id === result?.replyTrackingRuleId);

    let ruleId: string | null = rule?.id || null;

    // If rule found, update/create the label action to NEEDS_REPLY_LABEL
    if (rule) {
      const labelAction = rule.actions.find((a) => a.type === ActionType.LABEL);

      if (labelAction) {
        await prisma.action.update({
          where: { id: labelAction.id },
          data: { label: NEEDS_REPLY_LABEL_NAME },
        });
      } else {
        await prisma.action.create({
          data: {
            type: ActionType.LABEL,
            label: NEEDS_REPLY_LABEL_NAME,
            rule: { connect: { id: rule.id } },
          },
        });
      }
    }

    // If not found, create a reply required rule
    if (!ruleId) {
      const newRule = await safeCreateRule(
        {
          name: "Label Emails Requiring Reply",
          condition: {
            aiInstructions: `Apply this to emails needing my direct response. Exclude:
- All automated notifications (GitHub, social media, marketing)
- System emails (order confirmations, calendar invites)

Only flag when someone:
- Asks me a direct question
- Requests information or action
- Needs my specific input
- Follows up on a conversation`,
          },
          actions: [
            {
              type: ActionType.LABEL,
              fields: {
                label: NEEDS_REPLY_LABEL_NAME,
                to: null,
                subject: null,
                content: null,
                cc: null,
                bcc: null,
                webhookUrl: null,
              },
            },
          ],
        },
        userId,
      );

      if ("error" in newRule) {
        logger.error("Error enabling Reply Zero", {
          error: newRule.error,
        });
        return { error: "Error enabling Reply Zero" };
      }

      ruleId = newRule.id;

      if (!ruleId) {
        logger.error("Error enabling Reply Zero, no rule found");
        return { error: "Error enabling Reply Zero" };
      }

      // Add rule to prompt file
      await prisma.user.update({
        where: { id: userId },
        data: {
          rulesPrompt:
            `${user.rulesPrompt}\n\n* Label emails that require a reply as 'Reply Required'`.trim(),
        },
      });
    }

    // Update the rule to track replies
    if (!ruleId) {
      logger.error("Error enabling Reply Zero", {
        error: "No rule found",
      });
      return { error: "Error enabling Reply Zero" };
    }

    await prisma.rule.update({
      where: { id: ruleId },
      data: { trackReplies: true, runOnThreads: true },
    });

    revalidatePath("/reply-zero");

    return { success: true };
  },
);

export const processPreviousSentEmailsAction = withActionInstrumentation(
  "processPreviousSentEmails",
  async () => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        about: true,
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
      },
    });
    if (!user) return { error: "User not found" };

    const gmail = getGmailClient({ accessToken: session.accessToken });
    await processPreviousSentEmails(gmail, user, 100);

    return { success: true };
  },
);

const resolveThreadTrackerSchema = z.object({
  threadId: z.string(),
  resolved: z.boolean(),
});

type ResolveThreadTrackerBody = z.infer<typeof resolveThreadTrackerSchema>;

export const resolveThreadTrackerAction = withActionInstrumentation(
  "resolveThreadTracker",
  async (unsafeData: ResolveThreadTrackerBody) => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    const { data, success, error } =
      resolveThreadTrackerSchema.safeParse(unsafeData);
    if (!success) return { error: error.message };

    await startAnalyzingReplyTracker(userId).catch((error) => {
      logger.error("Error starting Reply Zero analysis", { error });
    });

    await prisma.threadTracker.updateMany({
      where: {
        threadId: data.threadId,
        userId,
      },
      data: { resolved: data.resolved },
    });

    await stopAnalyzingReplyTracker(userId).catch((error) => {
      logger.error("Error stopping Reply Zero analysis", { error });
    });

    revalidatePath("/reply-zero");

    return { success: true };
  },
);
