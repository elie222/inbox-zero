import prisma from "@/utils/prisma";
import { aiFindReplyTrackingRule } from "@/utils/ai/reply/check-reply-tracking";
import { safeCreateRule } from "@/utils/rule/rule";
import { ActionType } from "@prisma/client";
import {
  defaultReplyTrackerInstructions,
  NEEDS_REPLY_LABEL_NAME,
} from "@/utils/reply-tracker/consts";
import { createScopedLogger } from "@/utils/logger";

export async function enableReplyTracker(userId: string) {
  const logger = createScopedLogger("reply-tracker/enable").with({ userId });

  // If enabled already skip
  const existingRule = await prisma.rule.findUnique({
    where: { id: userId, trackReplies: true },
  });

  if (existingRule) return { success: true };

  // Find existing reply required rule, make it track replies
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
      about: true,
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
          aiInstructions: defaultReplyTrackerInstructions,
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
      logger.error("Error enabling Reply Zero", { error: newRule.error });
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
          `${user.rulesPrompt || ""}\n\n* Label emails that require a reply as 'Reply Required'`.trim(),
      },
    });
  }

  // Update the rule to track replies
  if (!ruleId) {
    logger.error("Error enabling Reply Zero", { error: "No rule found" });
    return { error: "Error enabling Reply Zero" };
  }

  await prisma.rule.update({
    where: { id: ruleId },
    data: { trackReplies: true, draftReplies: true, runOnThreads: true },
  });
}
