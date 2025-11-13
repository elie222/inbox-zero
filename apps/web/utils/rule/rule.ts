import type { CreateOrUpdateRuleSchema } from "@/utils/ai/rule/create-rule-schema";
import prisma from "@/utils/prisma";
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

export async function createRule({
  result,
  emailAccountId,
  systemType,
  provider,
  runOnThreads,
  logger,
}: {
  result: CreateOrUpdateRuleSchema;
  emailAccountId: string;
  systemType?: SystemType | null;
  provider: string;
  runOnThreads: boolean;
  logger: Logger;
}) {
  try {
    logger.info("Creating rule", {
      name: result.name,
      systemType,
    });

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
            data: await mapActionFields(
              result.actions,
              provider,
              emailAccountId,
            ),
          },
        },
        conditionalOperator: result.condition.conditionalOperator ?? undefined,
        instructions: result.condition.aiInstructions,
        from: result.condition.static?.from,
        to: result.condition.static?.to,
        subject: result.condition.static?.subject,
        ...(runOnThreads !== undefined && { runOnThreads }),
      },
      include: { actions: true, group: true },
    });

    await createRuleHistory({ rule, triggerType: "updated" });

    return rule;
  } catch (error) {
    logger.error("Error updating rule", { error });
    throw error;
  }
}

export async function upsertSystemRule({
  result,
  emailAccountId,
  systemType,
  provider,
  runOnThreads,
  logger,
}: {
  result: CreateOrUpdateRuleSchema;
  emailAccountId: string;
  systemType: SystemType;
  provider: string;
  runOnThreads: boolean;
  logger: Logger;
}) {
  logger.info("Upserting system rule", {
    name: result.name,
    systemType,
  });

  const existingRule = await prisma.rule.findFirst({
    where: {
      emailAccountId,
      OR: [{ systemType }, { name: result.name }],
    },
    include: { actions: true, group: true },
  });

  if (existingRule) {
    logger.info("Updating existing rule", {
      ruleId: existingRule.id,
      hadSystemType: !!existingRule.systemType,
    });

    return await updateRule({
      ruleId: existingRule.id,
      result,
      emailAccountId,
      provider,
      logger,
      runOnThreads,
    });
  } else {
    logger.info("Creating new system rule");

    return await createRule({
      result,
      emailAccountId,
      systemType,
      provider,
      runOnThreads,
      logger,
    });
  }
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
