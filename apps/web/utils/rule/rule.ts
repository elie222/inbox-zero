import type { CreateOrUpdateRuleSchema } from "@/utils/ai/rule/create-rule-schema";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { ActionType } from "@/generated/prisma/enums";
import type { SystemType } from "@/generated/prisma/enums";
import type { Prisma, Rule } from "@/generated/prisma/client";
import { getActionRiskLevel, type RiskAction } from "@/utils/risk";
import { hasExampleParams } from "@/app/(app)/[emailAccountId]/assistant/examples";
import { createRuleHistory } from "@/utils/rule/rule-history";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { createEmailProvider } from "@/utils/email/provider";
import { resolveLabelNameAndId } from "@/utils/label/resolve-label";
import { getMissingRecipientMessage } from "@/utils/rule/recipient-validation";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { SafeError } from "@/utils/error";
import type { AttachmentSourceInput } from "@/utils/attachments/source-schema";
import {
  getBlockedLowTrustStaticFromActionTypes,
  LOW_TRUST_STATIC_FROM_OUTBOUND_MESSAGE,
} from "@/utils/rule/static-from-risk";
import type { RuleWithRelations } from "@/utils/rule/types";
import type { RuleConditions } from "@/utils/condition";

type CreateRuleEnablement =
  | { source: "default" }
  | { source: "chat"; chatRiskConfirmed?: boolean };

export function outboundActionsNeedChatRiskConfirmation(
  result: CreateOrUpdateRuleSchema,
): { needsConfirmation: boolean; riskMessages: string[] } {
  const ruleCtx = ruleConditionsForRisk(result);
  const messages: string[] = [];
  for (const action of result.actions) {
    if (!OUTBOUND_ACTION_TYPES.includes(action.type)) continue;

    const ra: RiskAction = {
      type: action.type,
      subject: action.fields?.subject ?? null,
      content: action.fields?.content ?? null,
      to: action.fields?.to?.trim() || null,
      cc: action.fields?.cc ?? null,
      bcc: action.fields?.bcc ?? null,
    };
    const { level, message } = getActionRiskLevel(ra, ruleCtx);
    if (level !== "low" && !messages.includes(message)) {
      messages.push(message);
    }
  }
  return {
    needsConfirmation: messages.length > 0,
    riskMessages: messages,
  };
}

type RuleRecordData = {
  name?: string;
  systemType?: SystemType | null;
  instructions?: string | null;
  enabled?: boolean;
  automate?: boolean;
  runOnThreads?: boolean;
  conditionalOperator?: Rule["conditionalOperator"] | null;
  categoryFilterType?: Rule["categoryFilterType"] | null;
  from?: string | null;
  to?: string | null;
  subject?: string | null;
  body?: string | null;
  groupId?: string | null;
};

export function partialUpdateRule({
  ruleId,
  emailAccountId,
  data,
}: {
  ruleId: string;
  emailAccountId: string;
  data: Partial<Rule>;
}) {
  return prisma.rule.update({
    where: { id: ruleId, emailAccountId },
    data,
    include: { actions: true, group: true },
  });
}

export function updateRuleInstructions({
  ruleId,
  emailAccountId,
  instructions,
}: {
  ruleId: string;
  emailAccountId: string;
  instructions: string;
}) {
  return prisma.rule.update({
    where: { id: ruleId, emailAccountId },
    data: { instructions },
  });
}

export function setRuleRunOnThreads({
  ruleId,
  emailAccountId,
  runOnThreads,
}: {
  ruleId: string;
  emailAccountId: string;
  runOnThreads: boolean;
}) {
  return prisma.rule.update({
    where: { id: ruleId, emailAccountId },
    data: { runOnThreads },
  });
}

export function setRuleEnabled({
  ruleId,
  emailAccountId,
  enabled,
}: {
  ruleId: string;
  emailAccountId: string;
  enabled: boolean;
}) {
  return prisma.rule.update({
    where: { id: ruleId, emailAccountId },
    data: { enabled },
    include: { actions: true },
  });
}

export async function createRuleWithResolvedActions({
  emailAccountId,
  data,
  actions,
}: {
  emailAccountId: string;
  data: RuleRecordData & { name: string };
  actions: Prisma.ActionCreateManyRuleInput[];
}): Promise<RuleWithRelations> {
  validateLowTrustStaticFromOutboundActions({
    from: data.from,
    actionTypes: actions.map((action) => action.type),
  });

  const rule = await prisma.rule.create({
    data: {
      emailAccountId,
      name: data.name,
      systemType: data.systemType ?? undefined,
      instructions: data.instructions ?? undefined,
      enabled: data.enabled ?? undefined,
      automate: data.automate ?? undefined,
      runOnThreads: data.runOnThreads ?? undefined,
      conditionalOperator: data.conditionalOperator ?? undefined,
      categoryFilterType: data.categoryFilterType ?? undefined,
      from: data.from ?? undefined,
      to: data.to ?? undefined,
      subject: data.subject ?? undefined,
      body: data.body ?? undefined,
      groupId: data.groupId ?? undefined,
      actions: { createMany: { data: actions } },
    },
    include: { actions: true, group: true },
  });

  return rule as RuleWithRelations;
}

export async function replaceRuleWithResolvedActions({
  ruleId,
  emailAccountId,
  data,
  actions,
}: {
  ruleId: string;
  emailAccountId: string;
  data: RuleRecordData;
  actions: Prisma.ActionCreateManyRuleInput[];
}): Promise<RuleWithRelations> {
  validateLowTrustStaticFromOutboundActions({
    from: data.from,
    actionTypes: actions.map((action) => action.type),
  });

  const rule = await prisma.rule.update({
    where: { id: ruleId, emailAccountId },
    data: {
      name: data.name,
      systemType: data.systemType,
      instructions: data.instructions,
      enabled: data.enabled,
      automate: data.automate,
      runOnThreads: data.runOnThreads,
      conditionalOperator: data.conditionalOperator ?? undefined,
      categoryFilterType: data.categoryFilterType,
      from: data.from,
      to: data.to,
      subject: data.subject,
      body: data.body,
      groupId: data.groupId,
      actions: {
        deleteMany: {},
        createMany: { data: actions },
      },
    },
    include: { actions: true, group: true },
  });

  return rule as RuleWithRelations;
}

export async function createRule({
  result,
  emailAccountId,
  systemType,
  provider,
  runOnThreads,
  logger,
  enablement = { source: "default" } satisfies CreateRuleEnablement,
}: {
  result: CreateOrUpdateRuleSchema;
  emailAccountId: string;
  systemType?: SystemType | null;
  provider: string;
  runOnThreads: boolean;
  logger: Logger;
  enablement?: CreateRuleEnablement;
}) {
  try {
    logger.info("Creating rule", {
      name: result.name,
      systemType,
    });

    validateLowTrustStaticFromOutboundActions({
      from: result.condition.static?.from,
      actionTypes: result.actions.map((action) => action.type),
    });

    const mappedActions = await mapActionFields(
      result.actions,
      provider,
      emailAccountId,
      logger,
    );

    const rule = await createRuleWithResolvedActions({
      emailAccountId,
      data: {
        name: result.name,
        systemType,
        enabled: shouldEnable(
          result,
          mappedActions.map((a) => ({
            type: a.type,
            subject: a.subject ?? null,
            content: a.content ?? null,
            to: a.to ?? null,
            cc: a.cc ?? null,
            bcc: a.bcc ?? null,
          })),
          enablement,
        ),
        runOnThreads,
        conditionalOperator: result.condition.conditionalOperator ?? undefined,
        instructions: result.condition.aiInstructions,
        from: result.condition.static?.from,
        to: result.condition.static?.to,
        subject: result.condition.static?.subject,
      },
      actions: mappedActions,
    });

    await createRuleHistory({ rule, triggerType: "created" });

    return rule;
  } catch (error) {
    logger.error("Error creating rule", { error });
    throw error;
  }
}

export async function updateRule({
  ruleId,
  result,
  emailAccountId,
  provider,
  logger,
  runOnThreads,
}: {
  ruleId: string;
  result: CreateOrUpdateRuleSchema;
  emailAccountId: string;
  provider: string;
  logger: Logger;
  runOnThreads?: boolean;
}) {
  try {
    logger.info("Updating rule", {
      name: result.name,
      ruleId,
    });

    validateLowTrustStaticFromOutboundActions({
      from: result.condition.static?.from,
      actionTypes: result.actions.map((action) => action.type),
    });

    const mappedActions = await mapActionFields(
      result.actions,
      provider,
      emailAccountId,
      logger,
    );

    const rule = await replaceRuleWithResolvedActions({
      ruleId,
      emailAccountId,
      data: {
        name: result.name,
        conditionalOperator: result.condition.conditionalOperator ?? undefined,
        instructions: result.condition.aiInstructions,
        from: result.condition.static?.from,
        to: result.condition.static?.to,
        subject: result.condition.static?.subject,
        ...(runOnThreads !== undefined && { runOnThreads }),
      },
      actions: mappedActions,
    });

    await createRuleHistory({ rule, triggerType: "updated" });

    return rule;
  } catch (error) {
    logger.error("Error updating rule", { error });
    throw error;
  }
}

export async function upsertSystemRule({
  name,
  instructions,
  actions,
  emailAccountId,
  systemType,
  runOnThreads,
  enabled,
  logger,
}: {
  name: string;
  instructions: string;
  actions: Prisma.ActionCreateManyRuleInput[];
  emailAccountId: string;
  systemType: SystemType;
  runOnThreads: boolean;
  enabled: boolean;
  logger: Logger;
}) {
  logger.info("Upserting system rule", { name, systemType });

  const existingRule = await prisma.rule.findFirst({
    where: {
      emailAccountId,
      OR: [{ systemType }, { name }],
    },
    include: { actions: true, group: true },
  });

  const data = {
    name,
    instructions,
    systemType,
    runOnThreads,
    enabled,
  };

  if (existingRule) {
    logger.info("Updating existing rule", {
      ruleId: existingRule.id,
      hadSystemType: !!existingRule.systemType,
    });

    const rule = await replaceRuleWithResolvedActions({
      ruleId: existingRule.id,
      emailAccountId,
      data: {
        ...data,
      },
      actions,
    });

    await createRuleHistory({ rule, triggerType: "updated" });
    return rule;
  } else {
    logger.info("Creating new system rule");

    try {
      const rule = await createRuleWithResolvedActions({
        emailAccountId,
        data: {
          ...data,
        },
        actions,
      });

      await createRuleHistory({ rule, triggerType: "created" });
      return rule;
    } catch (error) {
      if (!isDuplicateError(error, "name")) throw error;

      logger.info("Rule already exists (race condition), updating instead");
      const existing = await prisma.rule.findFirst({
        where: { emailAccountId, name },
      });
      if (!existing) throw error;

      const rule = await replaceRuleWithResolvedActions({
        ruleId: existing.id,
        emailAccountId,
        data: {
          ...data,
        },
        actions,
      });

      await createRuleHistory({ rule, triggerType: "updated" });
      return rule;
    }
  }
}

export async function updateRuleActions({
  ruleId,
  actions,
  provider,
  emailAccountId,
  logger,
}: {
  ruleId: string;
  actions: CreateOrUpdateRuleSchema["actions"];
  provider: string;
  emailAccountId: string;
  logger: Logger;
}) {
  const existingRule = await prisma.rule.findFirst({
    where: { id: ruleId, emailAccountId },
    select: { from: true },
  });

  if (!existingRule) {
    throw new Error("Rule not found");
  }

  validateLowTrustStaticFromOutboundActions({
    from: existingRule.from,
    actionTypes: actions.map((action) => action.type),
  });

  return prisma.rule.update({
    where: { id: ruleId, emailAccountId },
    data: {
      actions: {
        deleteMany: {},
        createMany: {
          data: await mapActionFields(
            actions,
            provider,
            emailAccountId,
            logger,
          ),
        },
      },
    },
  });
}

export async function deleteRule({
  emailAccountId,
  ruleId,
  groupId,
}: {
  emailAccountId: string;
  ruleId: string;
  groupId?: string | null;
}) {
  if (groupId) {
    const deletedGroups = await prisma.group.deleteMany({
      where: { id: groupId, emailAccountId },
    });

    if (deletedGroups.count > 0) return;
  }

  await prisma.rule.delete({ where: { id: ruleId, emailAccountId } });
}

function shouldEnable(
  rule: CreateOrUpdateRuleSchema,
  actions: RiskAction[],
  enablement: CreateRuleEnablement,
) {
  if (
    hasExampleParams({
      condition: rule.condition,
      actions: rule.actions.map((a) => ({ content: a.fields?.content })),
    })
  )
    return false;

  if (enablement.source === "chat" && enablement.chatRiskConfirmed) {
    return true;
  }

  if (enablement.source === "chat") {
    const hasOutbound = rule.actions.some((a) =>
      OUTBOUND_ACTION_TYPES.includes(a.type),
    );
    if (!hasOutbound) {
      return actions.every(
        (action) => getActionRiskLevel(action, {}).level === "low",
      );
    }
    const ruleCtx = ruleConditionsForRisk(rule);
    for (const action of actions) {
      if (!OUTBOUND_ACTION_TYPES.includes(action.type)) continue;
      if (getActionRiskLevel(action, ruleCtx).level !== "low") {
        return false;
      }
    }
    return true;
  }

  if (rule.actions.find((a) => OUTBOUND_ACTION_TYPES.includes(a.type)))
    return false;

  const riskLevels = actions.map(
    (action) => getActionRiskLevel(action, {}).level,
  );
  return riskLevels.every((level) => level === "low");
}

function validateLowTrustStaticFromOutboundActions({
  from,
  actionTypes,
}: {
  from: string | null | undefined;
  actionTypes: readonly ActionType[];
}) {
  const blockedActionTypes = getBlockedLowTrustStaticFromActionTypes(
    from,
    actionTypes,
  );
  if (!blockedActionTypes.length) return;

  throw new SafeError(LOW_TRUST_STATIC_FROM_OUTBOUND_MESSAGE, 400);
}

async function mapActionFields(
  actions: (CreateOrUpdateRuleSchema["actions"][number] & {
    messagingChannelId?: string | null;
    labelId?: string | null;
    folderId?: string | null;
  })[],
  provider: string,
  emailAccountId: string,
  logger: Logger,
) {
  const actionPromises = actions.map(
    async (a): Promise<Prisma.ActionCreateManyRuleInput> => {
      const to = a.fields?.to?.trim() || null;
      const recipientMessage = getMissingRecipientMessage({
        actionType: a.type,
        recipient: to,
        sendEmailMessage:
          "SEND_EMAIL action requires a recipient in the to field. Use REPLY for automatic responses.",
        forwardMessage: "FORWARD action requires a recipient in the to field.",
      });
      if (recipientMessage) throw new Error(recipientMessage);

      let label = a.fields?.label;
      let labelId: string | null = null;
      const folderName =
        typeof a.fields?.folderName === "string" ? a.fields.folderName : null;
      let folderId: string | null = a.folderId || null;

      if (a.type === ActionType.LABEL) {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });

        const resolved = await resolveLabelNameAndId({
          emailProvider,
          label: a.fields?.label || null,
          labelId: a.labelId || null,
        });
        label = resolved.label;
        labelId = resolved.labelId;
      }

      if (
        a.type === ActionType.MOVE_FOLDER &&
        folderName &&
        !folderId &&
        isMicrosoftProvider(provider)
      ) {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });

        folderId = await emailProvider.getOrCreateFolderIdByName(folderName);
      }

      return {
        type: a.type,
        messagingChannelId: a.messagingChannelId ?? null,
        label,
        labelId,
        to,
        cc: a.fields?.cc,
        bcc: a.fields?.bcc,
        subject: a.fields?.subject,
        content: a.fields?.content,
        url: a.fields?.webhookUrl,
        ...(isMicrosoftProvider(provider) && {
          folderName: folderName ?? null,
          folderId,
        }),
        delayInMinutes: a.delayInMinutes,
        staticAttachments:
          (a as { staticAttachments?: AttachmentSourceInput[] | null })
            .staticAttachments ?? undefined,
      };
    },
  );

  return Promise.all(actionPromises);
}

const OUTBOUND_ACTION_TYPES: ActionType[] = [
  ActionType.REPLY,
  ActionType.SEND_EMAIL,
  ActionType.FORWARD,
];

function ruleConditionsForRisk(rule: CreateOrUpdateRuleSchema): RuleConditions {
  return {
    instructions: rule.condition.aiInstructions ?? undefined,
    from: rule.condition.static?.from ?? undefined,
    to: rule.condition.static?.to ?? undefined,
    subject: rule.condition.static?.subject ?? undefined,
  };
}
