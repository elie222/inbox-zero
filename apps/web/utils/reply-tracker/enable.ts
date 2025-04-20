import prisma from "@/utils/prisma";
import { safeCreateRule } from "@/utils/rule/rule";
import { ActionType, SystemType, type Prisma } from "@prisma/client";
import {
  defaultReplyTrackerInstructions,
  NEEDS_REPLY_LABEL_NAME,
} from "@/utils/reply-tracker/consts";
import { createScopedLogger } from "@/utils/logger";
import { RuleName } from "@/utils/rule/consts";

export async function enableReplyTracker({ email }: { email: string }) {
  const logger = createScopedLogger("reply-tracker/enable").with({ email });

  // Find existing reply required rule, make it track replies
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email },
    select: {
      userId: true,
      email: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
      about: true,
      rulesPrompt: true,
      rules: {
        where: {
          systemType: SystemType.TO_REPLY,
        },
        select: {
          id: true,
          systemType: true,
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

  // If enabled already skip
  if (!emailAccount) return { error: "Email account not found" };

  const rule = emailAccount.rules.find(
    (r) => r.systemType === SystemType.TO_REPLY,
  );

  if (rule?.actions.find((a) => a.type === ActionType.TRACK_THREAD)) {
    return { success: true, alreadyEnabled: true };
  }

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
    const newRule = await safeCreateRule({
      result: {
        name: RuleName.ToReply,
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
      email: emailAccount.email,
      systemType: SystemType.TO_REPLY,
    });

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
    await prisma.emailAccount.update({
      where: { email },
      data: {
        rulesPrompt:
          `${emailAccount.rulesPrompt || ""}\n\n* Label emails that require a reply as 'Reply Required'`.trim(),
      },
    });
  }

  // Update the rule to track replies
  if (!ruleId) {
    logger.error("Error enabling Reply Zero", { error: "No rule found" });
    return { error: "Error enabling Reply Zero" };
  }

  const updatedRule = await prisma.rule.update({
    where: { id: ruleId },
    data: { runOnThreads: true },
    select: { id: true, actions: true },
  });

  await Promise.allSettled([
    enableReplyTracking(updatedRule),
    enableDraftReplies(updatedRule),
    enableOutboundReplyTracking({ email }),
  ]);
}

async function enableReplyTracking(
  rule: Prisma.RuleGetPayload<{
    select: { id: true; actions: true };
  }>,
) {
  // already tracking replies
  if (rule.actions?.find((a) => a.type === ActionType.TRACK_THREAD)) return;

  await prisma.action.create({
    data: { ruleId: rule.id, type: ActionType.TRACK_THREAD },
  });
}

export async function enableDraftReplies(
  rule: Prisma.RuleGetPayload<{
    select: { id: true; actions: true };
  }>,
) {
  // already drafting replies
  if (rule.actions?.find((a) => a.type === ActionType.DRAFT_EMAIL)) return;

  await prisma.action.create({
    data: {
      ruleId: rule.id,
      type: ActionType.DRAFT_EMAIL,
    },
  });
}

async function enableOutboundReplyTracking({ email }: { email: string }) {
  await prisma.emailAccount.update({
    where: { email },
    data: { outboundReplyTracking: true },
  });
}
