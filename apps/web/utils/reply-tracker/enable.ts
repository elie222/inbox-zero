import prisma from "@/utils/prisma";
import { ActionType, SystemType, type Prisma } from "@prisma/client";
import { safeCreateRule } from "@/utils/rule/rule";
import { createScopedLogger } from "@/utils/logger";
import { ruleConfig, RuleName } from "@/utils/rule/consts";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import { resolveLabelNameAndId } from "@/utils/label/resolve-label";

export async function enableReplyTracker({
  emailAccountId,
  addDigest,
  provider,
}: {
  emailAccountId: string;
  addDigest?: boolean;
  provider: string;
}) {
  const logger = createScopedLogger("reply-tracker/enable").with({
    emailAccountId,
  });

  // Find existing reply required rule, make it track replies
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      id: true,
      userId: true,
      email: true,
      about: true,
      rulesPrompt: true,
      user: {
        select: {
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
        },
      },
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
              labelId: true,
            },
          },
        },
      },
    },
  });

  // If enabled already skip
  if (!emailAccount) throw new SafeError("Email account not found");

  const rule = emailAccount.rules.find(
    (r) => r.systemType === SystemType.TO_REPLY,
  );

  if (rule?.actions.find((a) => a.type === ActionType.TRACK_THREAD)) {
    return { success: true, alreadyEnabled: true };
  }

  let ruleId: string | null = rule?.id || null;

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
  });

  // Get the label from the rule's label action, or create default
  const existingLabelAction = rule?.actions.find(
    (a) => a.type === ActionType.LABEL,
  );
  const { label: needsReplyLabel, labelId: needsReplyLabelId } =
    await resolveLabelNameAndId({
      emailProvider,
      label: existingLabelAction?.labelId ? null : ruleConfig.ToReply.label,
      labelId: existingLabelAction?.labelId ?? null,
    });

  // If rule found, update/create the label action to NEEDS_REPLY_LABEL
  if (rule) {
    const labelAction = rule.actions.find((a) => a.type === ActionType.LABEL);

    if (labelAction) {
      await prisma.action.update({
        where: { id: labelAction.id },
        data: {
          label: needsReplyLabel,
          labelId: needsReplyLabelId,
        },
      });
    } else {
      await prisma.action.create({
        data: {
          type: ActionType.LABEL,
          label: needsReplyLabel,
          labelId: needsReplyLabelId,
          rule: { connect: { id: rule.id } },
        },
      });
    }
  }

  // If not found, create a reply required rule
  if (!ruleId) {
    const newRule = await createToReplyRule(
      emailAccountId,
      !!addDigest,
      provider,
    );

    if (newRule && "error" in newRule) {
      logger.error("Error enabling Reply Zero", { error: newRule.error });
      throw new SafeError("Error enabling Reply Zero");
    }

    ruleId = newRule?.id || null;

    if (!ruleId) {
      logger.error("Error enabling Reply Zero, no rule found");
      throw new SafeError("Error enabling Reply Zero");
    }

    // Add rule to prompt file
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: {
        rulesPrompt:
          `${emailAccount.rulesPrompt || ""}\n\n* Label emails that require a reply as 'Reply Required'`.trim(),
      },
    });
  }

  // Update the rule to track replies
  if (!ruleId) {
    logger.error("Error enabling Reply Zero", { error: "No rule found" });
    throw new SafeError("Error enabling Reply Zero");
  }

  const updatedRule = await prisma.rule.update({
    where: { id: ruleId },
    data: { runOnThreads: true },
    select: { id: true, actions: true },
  });

  await Promise.allSettled([
    enableReplyTracking(updatedRule),
    enableDraftReplies(updatedRule),
  ]);

  // Enable related conversation status types (FYI, Awaiting Reply, Actioned)
  await enableRelatedConversationStatuses({
    emailAccountId,
    provider,
  });
}

export async function createToReplyRule(
  emailAccountId: string,
  addDigest: boolean,
  provider: string,
) {
  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
  });

  // Check if there's an existing TO_REPLY rule with a label
  const existingRule = await prisma.rule.findFirst({
    where: { emailAccountId, systemType: SystemType.TO_REPLY },
    include: { actions: { where: { type: ActionType.LABEL } } },
  });

  const existingLabelAction = existingRule?.actions[0];

  const labelInfo = await resolveLabelNameAndId({
    emailProvider,
    label: existingLabelAction?.labelId ? null : ruleConfig.ToReply.label,
    labelId: existingLabelAction?.labelId ?? null,
  });

  return await safeCreateRule({
    result: {
      name: ruleConfig.ToReply.name,
      condition: {
        aiInstructions: ruleConfig.ToReply.instructions,
        conditionalOperator: null,
        static: null,
      },
      actions: [
        {
          type: ActionType.LABEL,
          labelId: labelInfo.labelId,
          fields: {
            label: labelInfo.label,
            to: null,
            subject: null,
            content: null,
            cc: null,
            bcc: null,
            webhookUrl: null,
            folderName: null,
          },
        },
        ...(addDigest ? [{ type: ActionType.DIGEST }] : []),
      ],
    },
    emailAccountId,
    systemType: SystemType.TO_REPLY,
    triggerType: "system_creation",
    shouldCreateIfDuplicate: false,
    provider,
  });
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

async function enableRelatedConversationStatuses({
  emailAccountId,
  provider,
}: {
  emailAccountId: string;
  provider: string;
}) {
  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
  });

  // Enable FYI, Awaiting Reply, and Actioned system types
  const statusesToEnable = [
    {
      systemType: SystemType.FYI,
      labelName: ruleConfig.Fyi.label,
      name: RuleName.Fyi,
    },
    {
      systemType: SystemType.AWAITING_REPLY,
      labelName: ruleConfig.AwaitingReply.label,
      name: RuleName.AwaitingReply,
    },
    {
      systemType: SystemType.ACTIONED,
      labelName: ruleConfig.Actioned.label,
      name: RuleName.Actioned,
    },
  ];

  const promises = statusesToEnable.map(
    async ({ systemType, labelName, name }) => {
      // Check if rule already exists
      const existingRule = await prisma.rule.findUnique({
        where: {
          emailAccountId_systemType: {
            emailAccountId,
            systemType,
          },
        },
      });

      if (existingRule) {
        // Rule exists, just enable it
        return prisma.rule.update({
          where: { id: existingRule.id },
          data: { enabled: true },
        });
      }

      // Create new rule with label
      const labelInfo = await resolveLabelNameAndId({
        emailProvider,
        label: labelName,
        labelId: null, // Will create if doesn't exist
      });

      return safeCreateRule({
        result: {
          name,
          condition: {
            aiInstructions:
              "Personal conversations with real people. Excludes: automated notifications and bulk emails.",
            conditionalOperator: null,
            static: null,
          },
          actions: [
            {
              type: ActionType.LABEL,
              labelId: labelInfo.labelId,
              fields: {
                label: labelInfo.label,
                to: null,
                subject: null,
                content: null,
                cc: null,
                bcc: null,
                webhookUrl: null,
                folderName: null,
              },
            },
            {
              type: ActionType.TRACK_THREAD,
              fields: {
                label: null,
                to: null,
                subject: null,
                content: null,
                cc: null,
                bcc: null,
                webhookUrl: null,
                folderName: null,
              },
            },
          ],
        },
        emailAccountId,
        systemType,
        triggerType: "system_creation",
        shouldCreateIfDuplicate: false,
        provider,
      });
    },
  );

  await Promise.allSettled(promises);
}
