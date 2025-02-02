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

    // 1. Find existing reply required rule, make it track replies
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

    let ruleId: string | null = result;

    // 2. If not found, create a reply required rule
    if (!ruleId) {
      const newRule = await safeCreateRule(
        {
          name: "Label Emails Requiring Reply",
          condition: {
            aiInstructions:
              "Identify emails that require a response or action, excluding automated notifications.",
          },
          actions: [
            {
              type: ActionType.LABEL,
              fields: {
                label: "Reply Required",
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
        logger.error("Error enabling reply tracker", {
          error: newRule.error,
        });
        return { error: "Error enabling reply tracker" };
      }

      ruleId = newRule.id;

      if (!ruleId) {
        logger.error("Error enabling reply tracker, no rule found");
        return { error: "Error enabling reply tracker" };
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
      logger.error("Error enabling reply tracker", {
        error: "No rule found",
      });
      return { error: "Error enabling reply tracker" };
    }

    await prisma.rule.update({
      where: { id: ruleId },
      data: { trackReplies: true },
    });

    revalidatePath("/reply-tracker");

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

    await prisma.threadTracker.updateMany({
      where: {
        threadId: data.threadId,
        userId,
      },
      data: { resolved: data.resolved },
    });

    revalidatePath("/reply-tracker");

    return { success: true };
  },
);
