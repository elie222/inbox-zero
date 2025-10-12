import prisma from "@/utils/prisma";
import { ActionType, SystemType, type Prisma } from "@prisma/client";
import { safeCreateRule } from "@/utils/rule/rule";
import { getRuleConfig, getRuleLabel, getRuleName } from "@/utils/rule/consts";
import { createEmailProvider } from "@/utils/email/provider";
import { resolveLabelNameAndId } from "@/utils/label/resolve-label";

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
    label: existingLabelAction?.labelId
      ? null
      : getRuleLabel(SystemType.TO_REPLY),
    labelId: existingLabelAction?.labelId ?? null,
  });

  return await safeCreateRule({
    result: {
      name: getRuleName(SystemType.TO_REPLY),
      condition: {
        aiInstructions: getRuleConfig(SystemType.TO_REPLY).instructions,
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
