"use server";

import { revalidatePath } from "next/cache";
import {
  createRuleBody,
  updateRuleBody,
  updateRuleSettingsBody,
  enableDraftRepliesBody,
  enableMultiRuleSelectionBody,
  deleteRuleBody,
  createRulesOnboardingBody,
  type CategoryConfig,
  type CategoryAction,
  toggleRuleBody,
} from "@/utils/actions/rule.validation";
import prisma from "@/utils/prisma";
import { isDuplicateError, isNotFoundError } from "@/utils/prisma-helpers";
import { flattenConditions } from "@/utils/condition";
import { ActionType, SystemType, type Prisma } from "@prisma/client";
import { sanitizeActionFields } from "@/utils/action-item";
import {
  deleteRule,
  upsertSystemRule,
  createRule,
  updateRule,
} from "@/utils/rule/rule";
import { SafeError } from "@/utils/error";
import {
  getRuleConfig,
  getSystemRuleActionTypes,
  getCategoryAction,
} from "@/utils/rule/consts";
import { actionClient } from "@/utils/actions/safe-action";
import { prefixPath } from "@/utils/path";
import { ONE_WEEK_MINUTES } from "@/utils/date";
import { createEmailProvider } from "@/utils/email/provider";
import { resolveLabelNameAndId } from "@/utils/label/resolve-label";
import type { Logger } from "@/utils/logger";
import { validateGmailLabelName } from "@/utils/gmail/label-validation";
import { isGoogleProvider } from "@/utils/email/provider-types";

export const createRuleAction = actionClient
  .metadata({ name: "createRule" })
  .inputSchema(createRuleBody)
  .action(
    async ({
      ctx: { emailAccountId, logger, provider },
      parsedInput: {
        name,
        runOnThreads,
        actions,
        conditions: conditionsInput,
        conditionalOperator,
      },
    }) => {
      const conditions = flattenConditions(conditionsInput);

      const resolvedActions = await resolveActionLabels(
        actions || [],
        emailAccountId,
        provider,
      );

      try {
        const rule = await createRule({
          result: {
            name,
            condition: {
              aiInstructions: conditions.instructions,
              conditionalOperator: conditionalOperator || null,
              static: {
                from: conditions.from || null,
                to: conditions.to || null,
                subject: conditions.subject || null,
              },
            },
            actions: resolvedActions.map(mapActionToSanitizedFields),
          },
          emailAccountId,
          provider,
          runOnThreads: runOnThreads ?? true,
          logger,
        });

        return { rule };
      } catch (error) {
        handleRuleError(error, logger);
      }
    },
  );

export const updateRuleAction = actionClient
  .metadata({ name: "updateRule" })
  .inputSchema(updateRuleBody)
  .action(
    async ({
      ctx: { emailAccountId, logger, provider },
      parsedInput: {
        id,
        name,
        runOnThreads,
        actions,
        conditions: conditionsInput,
        conditionalOperator,
      },
    }) => {
      const conditions = flattenConditions(conditionsInput);

      const resolvedActions = await resolveActionLabels(
        actions,
        emailAccountId,
        provider,
      );

      try {
        const rule = await updateRule({
          ruleId: id,
          result: {
            name: name || "",
            condition: {
              aiInstructions: conditions.instructions,
              conditionalOperator: conditionalOperator || null,
              static: {
                from: conditions.from || null,
                to: conditions.to || null,
                subject: conditions.subject || null,
              },
            },
            actions: resolvedActions.map(mapActionToSanitizedFields),
          },
          emailAccountId,
          provider,
          logger,
          runOnThreads: runOnThreads ?? undefined,
        });

        return { rule };
      } catch (error) {
        handleRuleError(error, logger);
      }
    },
  );

export const updateRuleSettingsAction = actionClient
  .metadata({ name: "updateRuleSettings" })
  .inputSchema(updateRuleSettingsBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { id, instructions } }) => {
      const currentRule = await prisma.rule.findUnique({
        where: { id, emailAccountId },
      });
      if (!currentRule) throw new SafeError("Rule not found");

      await prisma.rule.update({
        where: { id, emailAccountId },
        data: { instructions },
      });

      revalidatePath(prefixPath(emailAccountId, "/reply-zero"));
    },
  );

export const enableDraftRepliesAction = actionClient
  .metadata({ name: "enableDraftReplies" })
  .inputSchema(enableDraftRepliesBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { enable },
    }) => {
      let rule = await prisma.rule.findUnique({
        where: {
          emailAccountId_systemType: {
            emailAccountId,
            systemType: SystemType.TO_REPLY,
          },
        },
        include: { actions: true },
      });

      if (!rule && !enable) {
        return;
      }

      // if rule doesn't exist, then toggle will create it
      rule =
        rule ||
        (await toggleRule({
          emailAccountId,
          enabled: enable,
          systemType: SystemType.TO_REPLY,
          provider,
          ruleId: undefined,
          logger,
        }));

      if (enable) {
        const alreadyDraftingReplies = rule.actions.find(
          (a) => a.type === ActionType.DRAFT_EMAIL,
        );
        if (!alreadyDraftingReplies) {
          await prisma.action.create({
            data: {
              ruleId: rule.id,
              type: ActionType.DRAFT_EMAIL,
            },
          });
        }
      } else {
        await prisma.action.deleteMany({
          where: {
            ruleId: rule.id,
            type: ActionType.DRAFT_EMAIL,
          },
        });
      }

      revalidatePath(prefixPath(emailAccountId, "/reply-zero"));
    },
  );

export const enableMultiRuleSelectionAction = actionClient
  .metadata({ name: "enableMultiRuleSelection" })
  .inputSchema(enableMultiRuleSelectionBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { enable } }) => {
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { multiRuleSelectionEnabled: enable },
    });
  });

export const deleteRuleAction = actionClient
  .metadata({ name: "deleteRule" })
  .inputSchema(deleteRuleBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    const rule = await prisma.rule.findUnique({
      where: { id, emailAccountId },
      include: { actions: true, group: true },
    });
    if (!rule) return; // already deleted
    if (rule.emailAccountId !== emailAccountId)
      throw new SafeError("You don't have permission to delete this rule");

    try {
      await deleteRule({
        ruleId: id,
        emailAccountId,
        groupId: rule.groupId,
      });

      revalidatePath(prefixPath(emailAccountId, `/assistant/rule/${id}`));
    } catch (error) {
      if (isNotFoundError(error)) return;
      throw error;
    }
  });

export const createRulesOnboardingAction = actionClient
  .metadata({ name: "createRulesOnboarding" })
  .inputSchema(createRulesOnboardingBody)
  .action(
    async ({ ctx: { emailAccountId, provider, logger }, parsedInput }) => {
      const systemCategoryMap: Map<SystemType, CategoryConfig> = new Map();
      const customCategories: CategoryConfig[] = [];

      for (const category of parsedInput) {
        if (category.key) {
          systemCategoryMap.set(category.key, category);
        } else {
          customCategories.push(category);
        }
      }

      const emailAccount = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: { rulesPrompt: true },
      });
      if (!emailAccount) throw new SafeError("User not found");

      const promises: Promise<unknown>[] = [];

      const isSet = (
        value: string | undefined | null,
      ): value is
        | "label"
        | "label_archive"
        | "label_archive_delayed"
        | "move_folder"
        | "move_folder_delayed" => value !== "none" && value !== undefined;

      async function createSystemRuleForOnboarding(systemType: SystemType) {
        const ruleConfiguration = getRuleConfig(systemType);
        const { name, instructions, label, runOnThreads } = ruleConfiguration;
        const categoryAction = getCategoryAction(systemType, provider);

        const promise = (async () => {
          const actions = await getActionsFromCategoryAction({
            emailAccountId,
            ruleName: name,
            categoryAction,
            label,
            hasDigest: false,
            draftReply: !!ruleConfiguration.draftReply,
            provider,
            logger,
          });

          return upsertSystemRule({
            name,
            instructions,
            actions,
            emailAccountId,
            systemType,
            runOnThreads,
            logger,
          });
        })();

        promises.push(promise);
      }

      async function deleteRule(
        systemType: SystemType,
        emailAccountId: string,
      ) {
        const promise = async () => {
          const rule = await prisma.rule.findUnique({
            where: {
              emailAccountId_systemType: { emailAccountId, systemType },
            },
          });
          if (!rule) return;
          await prisma.rule.delete({ where: { id: rule.id } });
        };
        promises.push(promise());
      }

      // Process system rules
      const systemRules = [
        SystemType.TO_REPLY,
        SystemType.NEWSLETTER,
        SystemType.MARKETING,
        SystemType.CALENDAR,
        SystemType.RECEIPT,
        SystemType.NOTIFICATION,
        SystemType.COLD_EMAIL,
      ];

      for (const type of systemRules) {
        const config = systemCategoryMap.get(type);
        if (config && isSet(config.action)) {
          createSystemRuleForOnboarding(type);
        } else {
          deleteRule(type, emailAccountId);
        }
      }

      const conversationRules = [
        SystemType.FYI,
        SystemType.AWAITING_REPLY,
        SystemType.ACTIONED,
      ];

      for (const type of conversationRules) {
        const config = systemCategoryMap.get(SystemType.TO_REPLY);
        if (config && isSet(config.action)) {
          createSystemRuleForOnboarding(type);
        } else {
          deleteRule(type, emailAccountId);
        }
      }

      // Create rules for custom categories
      for (const customCategory of customCategories) {
        if (customCategory.action && isSet(customCategory.action)) {
          const actions = await getActionsFromCategoryAction({
            emailAccountId,
            ruleName: customCategory.name,
            categoryAction: customCategory.action,
            label: customCategory.name,
            hasDigest: false,
            draftReply: false,
            provider,
            logger,
          });

          const promise = prisma.rule
            .create({
              data: {
                emailAccountId,
                name: customCategory.name,
                instructions:
                  customCategory.description ||
                  `Custom category: ${customCategory.name}`,
                systemType: null,
                runOnThreads: true,
                actions: { createMany: { data: actions } },
              },
            })
            .then(() => {})
            .catch((error) => {
              if (isDuplicateError(error, "name")) return;
              logger.error("Error creating rule", { error });
              throw error;
            });

          promises.push(promise);
        }
      }

      await Promise.allSettled(promises);
    },
  );

export const toggleRuleAction = actionClient
  .metadata({ name: "toggleRule" })
  .inputSchema(toggleRuleBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { ruleId, systemType, enabled },
    }) => {
      await toggleRule({
        ruleId,
        systemType,
        enabled,
        emailAccountId,
        provider,
        logger,
      });
    },
  );

async function toggleRule({
  ruleId,
  systemType,
  enabled,
  emailAccountId,
  provider,
  logger,
}: {
  ruleId: string | undefined;
  systemType: SystemType | undefined;
  enabled: boolean;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) {
  if (ruleId) {
    return await prisma.rule.update({
      where: { id: ruleId, emailAccountId },
      data: { enabled },
      include: { actions: true },
    });
  }

  if (!systemType) {
    throw new SafeError("System type is required");
  }

  const existingRule = await prisma.rule.findUnique({
    where: {
      emailAccountId_systemType: {
        emailAccountId,
        systemType,
      },
    },
  });

  if (existingRule) {
    return await prisma.rule.update({
      where: { id: existingRule.id },
      data: { enabled },
      include: { actions: true },
    });
  }

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
  });

  const ruleConfig = getRuleConfig(systemType);
  const actionTypes = getSystemRuleActionTypes(systemType, provider);

  const actions: Prisma.ActionCreateManyRuleInput[] = [];

  for (const actionType of actionTypes) {
    if (actionType.includeFolder) {
      const folderId = await emailProvider.getOrCreateOutlookFolderIdByName(
        ruleConfig.name,
      );
      actions.push({
        type: actionType.type,
        folderId,
        folderName: ruleConfig.name,
      });
    } else if (actionType.includeLabel) {
      const labelInfo = await resolveLabelNameAndId({
        emailProvider,
        label: ruleConfig.label,
        labelId: null,
      });
      actions.push({
        type: actionType.type,
        labelId: labelInfo.labelId,
        label: labelInfo.label,
      });
    } else {
      actions.push({
        type: actionType.type,
      });
    }
  }

  const upsertedRule = await upsertSystemRule({
    name: ruleConfig.name,
    instructions: ruleConfig.instructions,
    actions,
    emailAccountId,
    systemType,
    runOnThreads: ruleConfig.runOnThreads,
    logger,
  });

  if (!upsertedRule) {
    logger.error("Failed to upsert system rule");
    throw new SafeError("Failed to create rule");
  }

  logger.info("Successfully upserted system rule", {
    ruleId: upsertedRule.id,
    ruleName: upsertedRule.name,
    systemType: upsertedRule.systemType,
  });

  return upsertedRule;
}

function mapActionToSanitizedFields(action: {
  type: ActionType;
  labelId?: {
    name?: string | null;
    value?: string | null;
    ai?: boolean | null;
  } | null;
  subject?: { value?: string | null } | null;
  content?: { value?: string | null } | null;
  to?: { value?: string | null } | null;
  cc?: { value?: string | null } | null;
  bcc?: { value?: string | null } | null;
  url?: { value?: string | null } | null;
  folderName?: { value?: string | null } | null;
  folderId?: { value?: string | null } | null;
  delayInMinutes?: number | null;
}) {
  return sanitizeActionFields({
    type: action.type,
    label: action.labelId?.name,
    labelId: action.labelId?.value,
    subject: action.subject?.value,
    content: action.content?.value,
    to: action.to?.value,
    cc: action.cc?.value,
    bcc: action.bcc?.value,
    url: action.url?.value,
    folderName: action.folderName?.value,
    folderId: action.folderId?.value,
    delayInMinutes: action.delayInMinutes,
  });
}

function handleRuleError(error: unknown, logger: Logger) {
  if (isDuplicateError(error, "name")) {
    throw new SafeError("Rule name already exists");
  }
  if (isDuplicateError(error, "groupId")) {
    throw new SafeError(
      "Group already has a rule. Please use the existing rule.",
    );
  }
  logger.error("Error creating/updating rule", { error });
  throw new SafeError("Error creating/updating rule");
}

async function resolveActionLabels<
  T extends {
    type: ActionType;
    labelId?: {
      name?: string | null;
      value?: string | null;
      ai?: boolean | null;
    } | null;
    folderName?: {
      value?: string | null;
    } | null;
    folderId?: {
      value?: string | null;
    } | null;
  },
>(actions: T[], emailAccountId: string, provider: string) {
  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
  });

  return Promise.all(
    actions.map(async (action) => {
      if (action.type === ActionType.LABEL) {
        const labelName = action.labelId?.name || action.labelId?.value || null;

        if (isGoogleProvider(provider) && labelName) {
          const validation = validateGmailLabelName(labelName);
          if (!validation.valid) {
            throw new SafeError(validation.error);
          }
        }

        const { label: resolvedLabel, labelId: resolvedLabelId } =
          await resolveLabelNameAndId({
            emailProvider,
            label: action.labelId?.name || null,
            labelId: action.labelId?.value || null,
          });
        return {
          ...action,
          labelId: {
            value: resolvedLabelId,
            name: resolvedLabel,
            ai: action.labelId?.ai,
          },
        };
      }
      if (action.type === ActionType.MOVE_FOLDER) {
        const folderName = action.folderName?.value;
        if (folderName && !action.folderId?.value) {
          const resolvedFolderId =
            await emailProvider.getOrCreateOutlookFolderIdByName(folderName);
          return {
            ...action,
            folderId: {
              value: resolvedFolderId,
            },
            folderName: {
              value: folderName,
            },
          };
        }
      }
      return action;
    }),
  );
}

async function getActionsFromCategoryAction({
  emailAccountId,
  ruleName,
  categoryAction,
  label,
  draftReply,
  hasDigest,
  provider,
  logger,
}: {
  emailAccountId: string;
  ruleName: string;
  categoryAction: CategoryAction;
  label: string;
  hasDigest: boolean;
  draftReply: boolean;
  provider: string;
  logger: Logger;
}): Promise<Prisma.ActionCreateManyRuleInput[]> {
  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
    logger,
  });

  const { label: labelName, labelId } = await resolveLabelNameAndId({
    emailProvider,
    label,
    labelId: null,
  });

  logger.info("Resolved label ID during onboarding", {
    requestedLabel: label,
    resolvedLabelName: labelName,
    resolvedLabelId: labelId,
    ruleName,
  });

  let actions: Prisma.ActionCreateManyRuleInput[] = [
    { type: ActionType.LABEL, label: labelName, labelId },
  ];

  switch (categoryAction) {
    case "label_archive":
    case "label_archive_delayed": {
      actions.push({
        type: ActionType.ARCHIVE,
        delayInMinutes:
          categoryAction === "label_archive_delayed"
            ? ONE_WEEK_MINUTES
            : undefined,
      });
      break;
    }
    case "move_folder":
    case "move_folder_delayed": {
      const folderId =
        await emailProvider.getOrCreateOutlookFolderIdByName(ruleName);

      logger.info("Resolved folder ID during onboarding", {
        folderName: ruleName,
        resolvedFolderId: folderId,
        categoryAction,
      });

      actions = [
        {
          type: ActionType.MOVE_FOLDER,
          folderId,
          folderName: ruleName,
          delayInMinutes:
            categoryAction === "move_folder_delayed"
              ? ONE_WEEK_MINUTES
              : undefined,
        },
      ];
      break;
    }
  }

  if (draftReply) {
    actions.push({ type: ActionType.DRAFT_EMAIL });
  }

  if (hasDigest) {
    actions.push({ type: ActionType.DIGEST });
  }

  return actions;
}
