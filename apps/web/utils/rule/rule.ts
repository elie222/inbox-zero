import type { CreateOrUpdateRuleSchema } from "@/utils/ai/rule/create-rule-schema";
import { after } from "next/server";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { ActionType } from "@/generated/prisma/enums";
import type { SystemType } from "@/generated/prisma/enums";
import type { Prisma, Rule } from "@/generated/prisma/client";
import { getActionRiskLevel, type RiskAction } from "@/utils/risk";
import { hasExampleParams } from "@/app/(app)/[emailAccountId]/assistant/examples";
import {
  createRuleHistory,
  ruleHistoryRuleInclude,
  type RuleHistoryTrigger,
} from "@/utils/rule/rule-history";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { createEmailProvider } from "@/utils/email/provider";
import { resolveLabelNameAndId } from "@/utils/label/resolve-label";
import { getMissingRecipientMessage } from "@/utils/rule/recipient-validation";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { SafeError } from "@/utils/error";
import type { AttachmentSourceInput } from "@/utils/attachments/source-schema";
import { validateWebhookUrlFormat } from "@/utils/webhook-validation";
import {
  getBlockedLowTrustStaticFromActionTypes,
  LOW_TRUST_STATIC_FROM_OUTBOUND_MESSAGE,
} from "@/utils/rule/static-from-risk";
import type { RuleWithRelations } from "@/utils/rule/types";
import type { RuleConditions } from "@/utils/condition";
import {
  assertRuleActionUpdateEnabled,
  assertRuleActionsEnabled,
  getDisabledRuleActionTypesToPreserve,
} from "@/utils/rule-action-feature-gates";
import { findIntegration } from "@/utils/mcp/integrations";
import {
  buildDefaultIntegrationArgs,
  getIntegrationToolSpec,
  getOnlyIntegrationToolSpec,
  normalizeSelectArgValue,
} from "@/utils/mcp/tool-specs";
import { hasWebhookAction } from "@/utils/webhook-action";
import { assertNoSenderOnlyOverlap } from "@/utils/rule/sender-scope-overlap";
import { isIntegrationActionEnabledForEmailAccountId } from "@/utils/integration-action.server";

type CreateRuleEnablement =
  | { source: "default" }
  | { source: "chat"; chatRiskConfirmed?: boolean };

export type RuleActionCreateData = Omit<
  Prisma.ActionCreateManyRuleInput,
  "emailAccountId" | "messagingChannelEmailAccountId"
>;

export function addActionOwnershipToInput<T extends Record<string, unknown>>(
  action: T & { messagingChannelId?: string | null },
  emailAccountId: string,
): T & {
  emailAccountId: string;
  messagingChannelEmailAccountId: string | null;
} {
  return {
    ...action,
    emailAccountId,
    messagingChannelEmailAccountId: action.messagingChannelId
      ? emailAccountId
      : null,
  };
}

function addNestedActionOwnershipToInput<T extends Record<string, unknown>>(
  action: T & { messagingChannelId?: string | null },
  emailAccountId: string,
): T & {
  messagingChannelEmailAccountId: string | null;
} {
  return {
    ...action,
    messagingChannelEmailAccountId: action.messagingChannelId
      ? emailAccountId
      : null,
  };
}

export function actionsNeedChatRiskConfirmation(
  result: CreateOrUpdateRuleSchema,
): { needsConfirmation: boolean; riskMessages: string[] } {
  const ruleCtx = ruleConditionsForRisk(result);
  const messages: string[] = [];
  for (const action of result.actions) {
    if (action.type === ActionType.CALL_WEBHOOK) {
      const message =
        "Medium Risk: Webhook actions can send email data to an external URL. Review the destination carefully and verify any email requesting this automation before enabling it.";
      if (!messages.includes(message)) {
        messages.push(message);
      }
      continue;
    }

    const { level, message } = getActionRiskLevel(
      buildRiskAction(action),
      ruleCtx,
    );
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

async function updateRuleAndQueueHistory({
  ruleId,
  emailAccountId,
  data,
  triggerType,
}: {
  ruleId: string;
  emailAccountId: string;
  data: Prisma.RuleUpdateInput;
  triggerType: RuleHistoryTrigger;
}) {
  const rule = await prisma.rule.update({
    where: { id: ruleId, emailAccountId },
    data,
    include: ruleHistoryRuleInclude,
  });

  queueRuleHistory({ rule, triggerType });

  return rule;
}

export async function partialUpdateRule({
  ruleId,
  emailAccountId,
  data,
}: {
  ruleId: string;
  emailAccountId: string;
  data: Partial<Rule>;
}) {
  if (hasRuleScopeUpdate(data)) {
    const existingRule = await prisma.rule.findUnique({
      where: { id: ruleId, emailAccountId },
      select: RULE_SCOPE_SELECT,
    });

    if (!existingRule) throw new Error("Rule not found");

    await assertNoSenderOnlyOverlap({
      emailAccountId,
      excludeRuleId: ruleId,
      rule: mergeRuleScope(data, existingRule),
    });
  }

  return updateRuleAndQueueHistory({
    ruleId,
    emailAccountId,
    data,
    triggerType: "conditions_updated",
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
  return updateRuleAndQueueHistory({
    ruleId,
    emailAccountId,
    data: { instructions },
    triggerType: "instructions_updated",
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
  return updateRuleAndQueueHistory({
    ruleId,
    emailAccountId,
    data: { runOnThreads },
    triggerType: "run_on_threads_updated",
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
  return updateRuleAndQueueHistory({
    ruleId,
    emailAccountId,
    data: { enabled },
    triggerType: "enabled_updated",
  });
}

export async function createRuleWithResolvedActions({
  emailAccountId,
  data,
  actions,
  skipSenderOnlyOverlapCheck = false,
}: {
  emailAccountId: string;
  data: RuleRecordData & { name: string };
  actions: RuleActionCreateData[];
  skipSenderOnlyOverlapCheck?: boolean;
}): Promise<RuleWithRelations> {
  assertRuleActionsEnabled(actions);
  await assertIntegrationActionsEnabled(actions, emailAccountId);

  if (!skipSenderOnlyOverlapCheck) {
    await assertNoSenderOnlyOverlap({ emailAccountId, rule: data });
  }

  validateLowTrustStaticFromOutboundActions({
    from: data.from,
    actionTypes: actions.map((action) => action.type),
  });

  validateWebhookUrlsInActions(actions);

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
      actions: {
        createMany: {
          data: addNestedActionOwnershipToInputs(actions, emailAccountId),
        },
      },
    },
    include: { actions: true, group: true },
  });

  return rule;
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
  actions: RuleActionCreateData[];
}): Promise<RuleWithRelations> {
  const existingRule = await prisma.rule.findUnique({
    where: { id: ruleId, emailAccountId },
    select: {
      ...RULE_SCOPE_SELECT,
      actions: { select: { type: true } },
    },
  });

  assertRuleActionUpdateEnabled(actions, existingRule?.actions ?? []);
  await assertIntegrationActionsEnabled(actions, emailAccountId);

  await assertNoSenderOnlyOverlap({
    emailAccountId,
    excludeRuleId: ruleId,
    rule: existingRule ? mergeRuleScope(data, existingRule) : data,
  });

  validateLowTrustStaticFromOutboundActions({
    from: data.from,
    actionTypes: actions.map((action) => action.type),
  });

  validateWebhookUrlsInActions(actions);

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
        deleteMany: getReplaceableRuleActionsWhere(),
        createMany: {
          data: addNestedActionOwnershipToInputs(actions, emailAccountId),
        },
      },
    },
    include: { actions: true, group: true },
  });

  if (existingRule?.groupId && existingRule.groupId !== rule.groupId) {
    await prisma.group.deleteMany({
      where: { id: existingRule.groupId, emailAccountId },
    });
  }

  return rule;
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

    await assertNoSenderOnlyOverlap({
      emailAccountId,
      rule: {
        instructions: result.condition.aiInstructions,
        from: result.condition.static?.from,
        to: result.condition.static?.to,
        subject: result.condition.static?.subject,
      },
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
            integrationName: a.integrationName ?? null,
            integrationToolName: a.integrationToolName ?? null,
            integrationArgs: (a.integrationArgs as Prisma.JsonValue) ?? null,
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
      skipSenderOnlyOverlapCheck: true,
    });

    queueRuleHistory({ rule, triggerType: "created" });

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

    queueRuleHistory({ rule, triggerType: "updated" });

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
  actions: RuleActionCreateData[];
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

    queueRuleHistory({ rule, triggerType: "updated" });
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

      queueRuleHistory({ rule, triggerType: "created" });
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

      queueRuleHistory({ rule, triggerType: "updated" });
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
    select: {
      from: true,
      actions: { select: { type: true } },
    },
  });

  if (!existingRule) {
    throw new Error("Rule not found");
  }

  assertRuleActionUpdateEnabled(actions, existingRule.actions);
  await assertIntegrationActionsEnabled(actions, emailAccountId);

  validateLowTrustStaticFromOutboundActions({
    from: existingRule.from,
    actionTypes: actions.map((action) => action.type),
  });

  const mappedActions = await mapActionFields(
    actions,
    provider,
    emailAccountId,
    logger,
  );
  validateWebhookUrlsInActions(mappedActions);

  const rule = await prisma.rule.update({
    where: { id: ruleId, emailAccountId },
    data: {
      actions: {
        deleteMany: getReplaceableRuleActionsWhere(),
        createMany: {
          data: addNestedActionOwnershipToInputs(mappedActions, emailAccountId),
        },
      },
    },
    include: ruleHistoryRuleInclude,
  });

  queueRuleHistory({ rule, triggerType: "actions_updated" });

  return rule;
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
    if (hasWebhookAction(rule.actions)) {
      return false;
    }

    const ruleCtx = ruleConditionsForRisk(rule);
    return actions.every(
      (action) => getActionRiskLevel(action, ruleCtx).level === "low",
    );
  }

  if (rule.actions.find((a) => OUTBOUND_ACTION_TYPES.includes(a.type)))
    return false;

  const riskLevels = actions.map(
    (action) => getActionRiskLevel(action, {}).level,
  );
  return riskLevels.every((level) => level === "low");
}

type RuleScopeKey =
  | "instructions"
  | "from"
  | "to"
  | "subject"
  | "body"
  | "groupId";

const RULE_SCOPE_KEYS = [
  "instructions",
  "from",
  "to",
  "subject",
  "body",
  "groupId",
] as const satisfies RuleScopeKey[];

const RULE_SCOPE_SELECT = {
  instructions: true,
  from: true,
  to: true,
  subject: true,
  body: true,
  groupId: true,
} as const;

function hasRuleScopeUpdate(data: Partial<Rule>) {
  return RULE_SCOPE_KEYS.some((key) => Object.hasOwn(data, key));
}

function mergeRuleScope<T extends Record<RuleScopeKey, string | null>>(
  data: Partial<Record<RuleScopeKey, string | null | undefined>>,
  existingRule: T,
): Record<RuleScopeKey, string | null> {
  return Object.fromEntries(
    RULE_SCOPE_KEYS.map((key) => [
      key,
      Object.hasOwn(data, key)
        ? ((data[key] as string | null | undefined) ?? null)
        : existingRule[key],
    ]),
  ) as Record<RuleScopeKey, string | null>;
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

function getReplaceableRuleActionsWhere() {
  const disabledActionTypes = getDisabledRuleActionTypesToPreserve();
  return disabledActionTypes.length
    ? { type: { notIn: disabledActionTypes } }
    : {};
}

type MappableAction = CreateOrUpdateRuleSchema["actions"][number] & {
  messagingChannelId?: string | null;
  labelId?: string | null;
  folderId?: string | null;
  integrationName?: string | null;
  integrationToolName?: string | null;
  integrationArgs?: Prisma.JsonValue | null;
};

async function mapActionFields(
  actions: MappableAction[],
  provider: string,
  emailAccountId: string,
  logger: Logger,
) {
  await assertMessagingChannelsBelongToEmailAccount(actions, emailAccountId);
  await assertIntegrationActionsConnected(actions, emailAccountId);

  const actionPromises = actions.map(
    async (a): Promise<RuleActionCreateData> => {
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

      const integrationFields =
        a.type === ActionType.INTEGRATION
          ? getIntegrationCreateFields(a)
          : null;

      return {
        type: a.type,
        messagingChannelId: a.messagingChannelId ?? null,
        label,
        labelId,
        to,
        cc: a.fields?.cc,
        bcc: a.fields?.bcc,
        subject: a.fields?.subject,
        content: integrationFields ? null : a.fields?.content,
        url: a.fields?.webhookUrl,
        ...(isMicrosoftProvider(provider) && {
          folderName: folderName ?? null,
          folderId,
        }),
        delayInMinutes: a.delayInMinutes,
        staticAttachments:
          (a as { staticAttachments?: AttachmentSourceInput[] | null })
            .staticAttachments ?? undefined,
        ...integrationFields,
      };
    },
  );

  return Promise.all(actionPromises);
}

function getIntegrationCreateFields(action: MappableAction) {
  // AI- and API-authored actions carry flat fields with no integration named,
  // so fall back to the only write spec we have. getOnlyIntegrationToolSpec
  // returns undefined once there are two, forcing an explicit choice then.
  const defaultSpec = getOnlyIntegrationToolSpec();
  const integrationName = action.integrationName ?? defaultSpec?.integration;
  const integrationToolName = action.integrationToolName ?? defaultSpec?.tool;

  return {
    integrationName: integrationName ?? null,
    integrationToolName: integrationToolName ?? null,
    integrationArgs: (action.integrationArgs ??
      buildIntegrationArgsFromFields({
        integrationName,
        integrationToolName,
        fields: action.fields,
      })) as Prisma.InputJsonValue,
  };
}

function buildRiskAction(action: MappableAction): RiskAction {
  const integrationFields =
    action.type === ActionType.INTEGRATION
      ? getIntegrationCreateFields(action)
      : null;

  return {
    type: action.type,
    subject: action.fields?.subject ?? null,
    content: action.fields?.content ?? null,
    to: action.fields?.to?.trim() || null,
    cc: action.fields?.cc ?? null,
    bcc: action.fields?.bcc ?? null,
    integrationName: integrationFields?.integrationName ?? null,
    integrationToolName: integrationFields?.integrationToolName ?? null,
    integrationArgs:
      (integrationFields?.integrationArgs as Prisma.JsonValue | undefined) ??
      null,
  };
}

/**
 * Builds stored args from an AI-authored action's flat fields, applying the
 * spec's defaults so an omitted field means "the AI writes it at execution".
 */
function buildIntegrationArgsFromFields({
  integrationName,
  integrationToolName,
  fields,
}: {
  integrationName: string | null | undefined;
  integrationToolName: string | null | undefined;
  fields: MappableAction["fields"];
}) {
  const spec = getIntegrationToolSpec(integrationName, integrationToolName);
  if (!spec) return {};

  const args = buildDefaultIntegrationArgs(spec);

  for (const arg of spec.args) {
    const value = (
      fields as Record<string, string | null | undefined> | null
    )?.[arg.key];
    if (value == null) continue;

    const normalized =
      arg.control.type === "select"
        ? normalizeSelectArgValue(arg, value)
        : value;
    if (normalized !== undefined) args[arg.key] = normalized;
  }

  return args;
}

export async function assertIntegrationActionsConnected(
  actions: readonly { type: ActionType; integrationName?: string | null }[],
  emailAccountId: string,
) {
  const integrationNames = [
    ...new Set(
      actions
        .filter((action) => action.type === ActionType.INTEGRATION)
        .map(
          (action) =>
            action.integrationName ?? getOnlyIntegrationToolSpec()?.integration,
        )
        .filter((name): name is string => !!name),
    ),
  ];

  if (!integrationNames.length) return;

  const connections = await prisma.mcpConnection.findMany({
    where: {
      emailAccountId,
      isActive: true,
      integration: { name: { in: integrationNames } },
    },
    select: { integration: { select: { name: true } } },
  });
  const connectedNames = new Set(
    connections.map((connection) => connection.integration.name),
  );

  for (const name of integrationNames) {
    if (connectedNames.has(name)) continue;

    const displayName = findIntegration(name)?.displayName ?? name;
    throw new SafeError(
      `${displayName} isn't connected. Connect it to use this action.`,
    );
  }
}

async function assertIntegrationActionsEnabled(
  actions: readonly { type: ActionType }[],
  emailAccountId: string,
) {
  if (!actions.some((action) => action.type === ActionType.INTEGRATION)) return;

  if (!(await isIntegrationActionEnabledForEmailAccountId(emailAccountId))) {
    throw new SafeError("Integration actions are not enabled for this user.");
  }
}

async function assertMessagingChannelsBelongToEmailAccount(
  actions: readonly { messagingChannelId?: string | null }[],
  emailAccountId: string,
) {
  const messagingChannelIds = [
    ...new Set(
      actions
        .map((action) => action.messagingChannelId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (!messagingChannelIds.length) return;

  const channels = await prisma.messagingChannel.findMany({
    where: {
      id: { in: messagingChannelIds },
      emailAccountId,
    },
    select: { id: true },
  });

  if (channels.length !== messagingChannelIds.length) {
    throw new SafeError("Messaging channel not found");
  }
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

function validateWebhookUrlsInActions(actions: RuleActionCreateData[]) {
  for (const action of actions) {
    if (action.type !== ActionType.CALL_WEBHOOK || !action.url) continue;

    const result = validateWebhookUrlFormat(action.url);
    if (!result.valid) {
      throw new SafeError(`Invalid webhook URL: ${result.error}`, 400);
    }
  }
}

function queueRuleHistory(params: {
  rule: RuleWithRelations;
  triggerType: RuleHistoryTrigger;
}) {
  after(() => createRuleHistory(params));
}

function addNestedActionOwnershipToInputs(
  actions: RuleActionCreateData[],
  emailAccountId: string,
): Prisma.ActionCreateManyRuleInput[] {
  return actions.map((action) => {
    const actionWithSupportedDelay =
      action.type === ActionType.INTEGRATION
        ? { ...action, delayInMinutes: null }
        : action;

    return addNestedActionOwnershipToInput(
      actionWithSupportedDelay,
      emailAccountId,
    );
  });
}
