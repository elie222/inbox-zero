import type { CreateOrUpdateRuleSchema } from "@/utils/ai/rule/create-rule-schema";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import type { Logger } from "@/utils/logger";
import { ActionType } from "@prisma/client";
import type { Prisma, Rule, SystemType } from "@prisma/client";
import { getActionRiskLevel, type RiskAction } from "@/utils/risk";
import { hasExampleParams } from "@/app/(app)/[emailAccountId]/assistant/examples";
import { createRuleHistory } from "@/utils/rule/rule-history";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { createEmailProvider } from "@/utils/email/provider";
import { resolveLabelNameAndId } from "@/utils/label/resolve-label";

export function partialUpdateRule({
  ruleId,
  data,
}: {
  ruleId: string;
  data: Partial<Rule>;
}) {
  return prisma.rule.update({
    where: { id: ruleId },
    data,
    include: { actions: true, group: true },
  });
}

// Extended type for system rules that can include labelId and folderId
type CreateRuleWithLabelId = Omit<CreateOrUpdateRuleSchema, "actions"> & {
  actions: (CreateOrUpdateRuleSchema["actions"][number] & {
    labelId?: string | null;
    folderId?: string | null;
  })[];
};

export async function safeCreateRule({
  result,
  emailAccountId,
  provider,
  systemType,
  triggerType = "ai_creation",
  shouldCreateIfDuplicate,
  runOnThreads,
  logger,
}: {
  result: CreateRuleWithLabelId;
  emailAccountId: string;
  provider: string;
  systemType?: SystemType | null;
  triggerType?: "ai_creation" | "manual_creation" | "system_creation";
  shouldCreateIfDuplicate: boolean; // maybe this should just always be false?
  runOnThreads: boolean;
  logger: Logger;
}) {
  try {
    const rule = await createRule({
      result,
      emailAccountId,
      systemType,
      triggerType,
      provider,
      runOnThreads,
    });
    return rule;
  } catch (error) {
    if (isDuplicateError(error, "name")) {
      if (shouldCreateIfDuplicate) {
        // if rule name already exists, create a new rule with a unique name
        logger.warn("Creating duplicate rule with timestamp suffix", {
          originalName: result.name,
          systemType,
          triggerType,
        });
        const rule = await createRule({
          result: { ...result, name: `${result.name} - ${Date.now()}` },
          emailAccountId,
          systemType,
          triggerType,
          provider,
          runOnThreads,
        });
        return rule;
      } else {
        // Check if there's an existing rule with this name
        const existingRule = await prisma.rule.findUnique({
          where: {
            name_emailAccountId: {
              emailAccountId,
              name: result.name,
            },
          },
          include: { actions: true, group: true },
        });

        // If we're creating a system rule and the existing rule doesn't have
        // the same systemType, create the system rule with a unique name
        // to avoid breaking system functionality
        if (systemType && existingRule?.systemType !== systemType) {
          logger.info("Creating system rule with unique name due to conflict", {
            systemType,
            existingRuleName: result.name,
            existingRuleSystemType: existingRule?.systemType,
          });
          const rule = await createRule({
            result: { ...result, name: `${result.name} - ${Date.now()}` },
            emailAccountId,
            systemType,
            triggerType,
            provider,
            runOnThreads,
          });
          return rule;
        }

        return existingRule;
      }
    }

    logger.error("Error creating rule", {
      emailAccountId,
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack, name: error.name }
          : error,
    });
    // return { error: "Error creating rule." };
  }
}

export async function safeUpdateRule({
  ruleId,
  result,
  emailAccountId,
  triggerType = "ai_update",
  provider,
  logger,
}: {
  ruleId: string;
  result: CreateOrUpdateRuleSchema;
  emailAccountId: string;
  triggerType?: "ai_update" | "manual_update" | "system_update";
  provider: string;
  logger: Logger;
}) {
  try {
    const rule = await updateRule({
      ruleId,
      result,
      emailAccountId,
      triggerType,
      provider,
    });
    return { id: rule.id };
  } catch (error) {
    if (isDuplicateError(error, "name")) {
      logger.warn("Rule name already exists", {
        ruleName: result.name,
        triggerType,
      });

      return { error: "A rule with this name already exists." };
    }

    logger.error("Error updating rule", {
      emailAccountId,
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack, name: error.name }
          : error,
    });

    return { error: "Error updating rule." };
  }
}

export async function createRule({
  result,
  emailAccountId,
  systemType,
  triggerType = "ai_creation",
  provider,
  runOnThreads,
}: {
  result: CreateOrUpdateRuleSchema;
  emailAccountId: string;
  systemType?: SystemType | null;
  triggerType?: "ai_creation" | "manual_creation" | "system_creation";
  provider: string;
  runOnThreads: boolean;
}) {
  const mappedActions = await mapActionFields(
    result.actions,
    provider,
    emailAccountId,
  );

  const rule = await prisma.rule.create({
    data: {
      name: result.name,
      emailAccountId,
      systemType,
      actions: { createMany: { data: mappedActions } },
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
      ),
      runOnThreads,
      conditionalOperator: result.condition.conditionalOperator ?? undefined,
      instructions: result.condition.aiInstructions,
      from: result.condition.static?.from,
      to: result.condition.static?.to,
      subject: result.condition.static?.subject,
    },
    include: { actions: true, group: true },
  });

  // Track rule creation in history
  await createRuleHistory({ rule, triggerType });

  return rule;
}

async function updateRule({
  ruleId,
  result,
  emailAccountId,
  triggerType = "ai_update",
  provider,
}: {
  ruleId: string;
  result: CreateOrUpdateRuleSchema;
  emailAccountId: string;
  triggerType?: "ai_update" | "manual_update" | "system_update";
  provider: string;
}) {
  const rule = await prisma.rule.update({
    where: { id: ruleId },
    data: {
      name: result.name,
      emailAccountId,
      // NOTE: this is safe for now as `Action` doesn't have relations
      // but if we add relations to `Action`, we would need to `update` here instead of `deleteMany` and `createMany` to avoid cascading deletes
      actions: {
        deleteMany: {},
        createMany: {
          data: await mapActionFields(result.actions, provider, emailAccountId),
        },
      },
      conditionalOperator: result.condition.conditionalOperator ?? undefined,
      instructions: result.condition.aiInstructions,
      from: result.condition.static?.from,
      to: result.condition.static?.to,
      subject: result.condition.static?.subject,
    },
    include: { actions: true, group: true },
  });

  // Track rule update in history
  await createRuleHistory({ rule, triggerType });

  return rule;
}

export async function updateRuleActions({
  ruleId,
  actions,
  provider,
  emailAccountId,
}: {
  ruleId: string;
  actions: CreateOrUpdateRuleSchema["actions"];
  provider: string;
  emailAccountId: string;
}) {
  return prisma.rule.update({
    where: { id: ruleId },
    data: {
      actions: {
        deleteMany: {},
        createMany: {
          data: await mapActionFields(actions, provider, emailAccountId),
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
  return Promise.all([
    prisma.rule.delete({ where: { id: ruleId, emailAccountId } }),
    // in the future, we can make this a cascade delete, but we need to change the schema for this to happen
    groupId
      ? prisma.group.delete({ where: { id: groupId, emailAccountId } })
      : null,
  ]);
}

function shouldEnable(rule: CreateOrUpdateRuleSchema, actions: RiskAction[]) {
  // Don't automate if it's an example rule that should have been edited by the user
  if (
    hasExampleParams({
      condition: rule.condition,
      actions: rule.actions.map((a) => ({ content: a.fields?.content })),
    })
  )
    return false;

  // Don't automate sending or replying to emails
  if (
    rule.actions.find(
      (a) => a.type === ActionType.REPLY || a.type === ActionType.SEND_EMAIL,
    )
  )
    return false;

  const riskLevels = actions.map(
    (action) => getActionRiskLevel(action, {}).level,
  );
  // Only enable if all actions are low risk
  return riskLevels.every((level) => level === "low");
}

async function mapActionFields(
  actions: (CreateOrUpdateRuleSchema["actions"][number] & {
    labelId?: string | null;
    folderId?: string | null;
  })[],
  provider: string,
  emailAccountId: string,
) {
  const actionPromises = actions.map(
    async (a): Promise<Prisma.ActionCreateManyRuleInput> => {
      let label = a.fields?.label;
      let labelId: string | null = null;
      const folderName =
        typeof a.fields?.folderName === "string" ? a.fields.folderName : null;
      let folderId: string | null = a.folderId || null;

      if (a.type === ActionType.LABEL) {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
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
        });

        folderId =
          await emailProvider.getOrCreateOutlookFolderIdByName(folderName);
      }

      return {
        type: a.type,
        label,
        labelId,
        to: a.fields?.to,
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
      };
    },
  );

  return Promise.all(actionPromises);
}
