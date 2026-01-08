"use server";

import { revalidatePath } from "next/cache";
import { ONBOARDING_PROCESS_EMAILS_COUNT } from "@/utils/config";
import { after } from "next/server";
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
  toggleAllRulesBody,
  copyRulesFromAccountBody,
  importRulesBody,
  type ImportedRule,
} from "@/utils/actions/rule.validation";
import prisma from "@/utils/prisma";
import { isDuplicateError, isNotFoundError } from "@/utils/prisma-helpers";
import { flattenConditions } from "@/utils/condition";
import { ActionType, SystemType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
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
  getActionTypesForCategoryAction,
} from "@/utils/rule/consts";
import { actionClient, actionClientUser } from "@/utils/actions/safe-action";
import { prefixPath } from "@/utils/path";
import { ONE_WEEK_MINUTES } from "@/utils/date";
import { createEmailProvider } from "@/utils/email/provider";
import { resolveLabelNameAndId } from "@/utils/label/resolve-label";
import type { Logger } from "@/utils/logger";
import { validateGmailLabelName } from "@/utils/gmail/label-validation";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { bulkProcessInboxEmails } from "@/utils/ai/choose-rule/bulk-process-emails";
import { getEmailAccountWithAi } from "@/utils/user/get";

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
      const conditions = flattenConditions(conditionsInput, logger);

      const resolvedActions = await resolveActionLabels(
        actions || [],
        emailAccountId,
        provider,
        logger,
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
      const conditions = flattenConditions(conditionsInput, logger);

      const resolvedActions = await resolveActionLabels(
        actions,
        emailAccountId,
        provider,
        logger,
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

      const emailAccount = await getEmailAccountWithAi({ emailAccountId });
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

      async function createSystemRuleForOnboarding(
        systemType: SystemType,
        userSelectedAction?: CategoryAction,
      ) {
        const ruleConfiguration = getRuleConfig(systemType);
        const { name, instructions, label, runOnThreads } = ruleConfiguration;
        const categoryAction =
          userSelectedAction || getCategoryAction(systemType, provider);

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
            systemType,
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
          createSystemRuleForOnboarding(type, config.action);
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
            systemType: undefined,
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

      after(() =>
        bulkProcessInboxEmails({
          emailAccount,
          provider,
          maxEmails: ONBOARDING_PROCESS_EMAILS_COUNT,
          skipArchive: true,
          logger,
        }),
      );
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

export const toggleAllRulesAction = actionClient
  .metadata({ name: "toggleAllRules" })
  .inputSchema(toggleAllRulesBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { enabled } }) => {
    await prisma.rule.updateMany({
      where: { emailAccountId },
      data: { enabled },
    });

    return { success: true };
  });

export const copyRulesFromAccountAction = actionClientUser
  .metadata({ name: "copyRulesFromAccount" })
  .inputSchema(copyRulesFromAccountBody)
  .action(
    async ({
      ctx: { userId, logger },
      parsedInput: { sourceEmailAccountId, targetEmailAccountId, ruleIds },
    }) => {
      if (sourceEmailAccountId === targetEmailAccountId) {
        throw new SafeError("Source and target accounts must be different");
      }

      // Validate user owns both accounts
      const [sourceAccount, targetAccount] = await Promise.all([
        prisma.emailAccount.findUnique({
          where: { id: sourceEmailAccountId },
          select: {
            id: true,
            email: true,
            account: { select: { userId: true, provider: true } },
          },
        }),
        prisma.emailAccount.findUnique({
          where: { id: targetEmailAccountId },
          select: {
            id: true,
            email: true,
            account: { select: { userId: true, provider: true } },
          },
        }),
      ]);

      if (!sourceAccount || sourceAccount.account.userId !== userId) {
        throw new SafeError("Source account not found or unauthorized");
      }
      if (!targetAccount || targetAccount.account.userId !== userId) {
        throw new SafeError("Target account not found or unauthorized");
      }

      // Fetch selected rules from source account
      const sourceRules = await prisma.rule.findMany({
        where: {
          emailAccountId: sourceEmailAccountId,
          id: { in: ruleIds },
        },
        include: { actions: true },
      });

      if (sourceRules.length === 0) {
        return { copiedCount: 0, replacedCount: 0 };
      }

      // Fetch existing rules in target account to check for duplicates
      const targetRules = await prisma.rule.findMany({
        where: { emailAccountId: targetEmailAccountId },
        select: { id: true, name: true, systemType: true },
      });

      // Build lookup maps for matching existing rules
      const targetRulesByName = new Map(
        targetRules.map((r) => [r.name.toLowerCase(), r.id]),
      );
      const targetRulesBySystemType = new Map(
        targetRules
          .filter((r) => r.systemType)
          .map((r) => [r.systemType!, r.id]),
      );

      let copiedCount = 0;
      let replacedCount = 0;

      for (const sourceRule of sourceRules) {
        // For system rules, match by systemType; for regular rules, match by name
        const existingRuleId = sourceRule.systemType
          ? targetRulesBySystemType.get(sourceRule.systemType)
          : targetRulesByName.get(sourceRule.name.toLowerCase());

        // Map actions - keep label names but clear IDs (they'll be resolved when rule executes)
        const mappedActions = sourceRule.actions.map((action) => ({
          type: action.type,
          label: action.label, // Keep the label name
          labelId: null, // Clear the ID - it's account-specific
          subject: action.subject,
          content: action.content,
          to: action.to,
          cc: action.cc,
          bcc: action.bcc,
          url: action.url,
          folderName: action.folderName, // Keep folder name
          folderId: null, // Clear the ID - it's account-specific
          delayInMinutes: action.delayInMinutes,
        }));

        if (existingRuleId) {
          // Update existing rule
          await prisma.rule.update({
            where: { id: existingRuleId },
            data: {
              instructions: sourceRule.instructions,
              enabled: sourceRule.enabled,
              runOnThreads: sourceRule.runOnThreads,
              conditionalOperator: sourceRule.conditionalOperator,
              from: sourceRule.from,
              to: sourceRule.to,
              subject: sourceRule.subject,
              body: sourceRule.body,
              // Drop groupId - it's account-specific
              groupId: null,
              actions: {
                deleteMany: {},
                createMany: { data: mappedActions },
              },
            },
          });
          replacedCount++;
        } else {
          // Create new rule
          await prisma.rule.create({
            data: {
              emailAccountId: targetEmailAccountId,
              name: sourceRule.name,
              systemType: sourceRule.systemType,
              instructions: sourceRule.instructions,
              enabled: sourceRule.enabled,
              runOnThreads: sourceRule.runOnThreads,
              conditionalOperator: sourceRule.conditionalOperator,
              from: sourceRule.from,
              to: sourceRule.to,
              subject: sourceRule.subject,
              body: sourceRule.body,
              // Drop groupId - it's account-specific
              groupId: null,
              actions: { createMany: { data: mappedActions } },
            },
          });
          copiedCount++;
        }
      }

      logger.info("Copied rules between accounts", {
        sourceEmailAccountId,
        targetEmailAccountId,
        copiedCount,
        replacedCount,
      });

      return { copiedCount, replacedCount };
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
    logger,
  });

  const ruleConfig = getRuleConfig(systemType);
  const actionTypes = getSystemRuleActionTypes(systemType, provider);

  const actions: Prisma.ActionCreateManyRuleInput[] = [];

  for (const actionType of actionTypes) {
    if (actionType.includeFolder) {
      const folderId = await emailProvider.getOrCreateFolderIdByName(
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
  const sanitized = sanitizeActionFields({
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

  return {
    type: sanitized.type,
    fields: {
      label: sanitized.label ?? null,
      to: sanitized.to ?? null,
      cc: sanitized.cc ?? null,
      bcc: sanitized.bcc ?? null,
      subject: sanitized.subject ?? null,
      content: sanitized.content ?? null,
      webhookUrl: sanitized.url ?? null,
      folderName: sanitized.folderName ?? null,
    },
    labelId: sanitized.labelId ?? null,
    folderId: sanitized.folderId ?? null,
    delayInMinutes: sanitized.delayInMinutes ?? null,
  };
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
>(actions: T[], emailAccountId: string, provider: string, logger: Logger) {
  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
    logger,
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
            await emailProvider.getOrCreateFolderIdByName(folderName);
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
  systemType,
}: {
  emailAccountId: string;
  ruleName: string;
  categoryAction: CategoryAction;
  label: string;
  hasDigest: boolean;
  draftReply: boolean;
  provider: string;
  logger: Logger;
  systemType?: SystemType;
}): Promise<Prisma.ActionCreateManyRuleInput[]> {
  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
    logger,
  });

  function normalizeCategory(action: CategoryAction) {
    switch (action) {
      case "label_archive_delayed":
        return { base: "label_archive" as const, isDelayed: true };
      case "move_folder_delayed":
        return { base: "move_folder" as const, isDelayed: true };
      default:
        return {
          base: action as "label" | "label_archive" | "move_folder",
          isDelayed: false,
        };
    }
  }

  const { base: baseCategoryAction, isDelayed } =
    normalizeCategory(categoryAction);

  const actionTypes = getActionTypesForCategoryAction({
    categoryAction: baseCategoryAction,
    systemType,
    draftReply,
    hasDigest,
  });

  const actions: Prisma.ActionCreateManyRuleInput[] = [];

  for (const actionType of actionTypes) {
    switch (actionType.type) {
      case ActionType.LABEL: {
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

        actions.push({ type: ActionType.LABEL, label: labelName, labelId });
        break;
      }
      case ActionType.MOVE_FOLDER: {
        const folderId =
          await emailProvider.getOrCreateFolderIdByName(ruleName);

        logger.info("Resolved folder ID during onboarding", {
          folderName: ruleName,
          resolvedFolderId: folderId,
          categoryAction,
        });

        actions.push({
          type: ActionType.MOVE_FOLDER,
          folderId,
          folderName: ruleName,
          delayInMinutes: isDelayed ? ONE_WEEK_MINUTES : undefined,
        });
        break;
      }
      case ActionType.ARCHIVE: {
        actions.push({
          type: ActionType.ARCHIVE,
          delayInMinutes: isDelayed ? ONE_WEEK_MINUTES : undefined,
        });
        break;
      }
      default: {
        actions.push({ type: actionType.type });
      }
    }
  }

  return actions;
}

export const importRulesAction = actionClient
  .metadata({ name: "importRules" })
  .inputSchema(importRulesBody)
  .action(
    async ({ ctx: { emailAccountId, logger }, parsedInput: { rules } }) => {
      logger.info("Importing rules", { count: rules.length });

      // Fetch existing rules to check for duplicates by name or systemType
      const existingRules = await prisma.rule.findMany({
        where: { emailAccountId },
        select: { id: true, name: true, systemType: true },
      });

      const rulesByName = new Map(
        existingRules.map((r) => [r.name.toLowerCase(), r.id]),
      );
      const rulesBySystemType = new Map(
        existingRules
          .filter((r) => r.systemType)
          .map((r) => [r.systemType!, r.id]),
      );

      let createdCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      for (const rule of rules) {
        try {
          // Match by systemType first, then by name
          const existingRuleId = rule.systemType
            ? rulesBySystemType.get(rule.systemType)
            : rulesByName.get(rule.name.toLowerCase());

          // Map actions - keep label names but clear IDs
          const mappedActions = rule.actions.map((action) => ({
            type: action.type,
            label: action.label,
            labelId: null,
            subject: action.subject,
            content: action.content,
            to: action.to,
            cc: action.cc,
            bcc: action.bcc,
            folderName: action.folderName,
            folderId: null,
            url: action.url,
            delayInMinutes: action.delayInMinutes,
          }));

          if (existingRuleId) {
            // Update existing rule
            await prisma.rule.update({
              where: { id: existingRuleId },
              data: {
                instructions: rule.instructions,
                enabled: rule.enabled ?? true,
                automate: rule.automate ?? true,
                runOnThreads: rule.runOnThreads ?? false,
                conditionalOperator: rule.conditionalOperator,
                categoryFilterType: rule.categoryFilterType,
                from: rule.from,
                to: rule.to,
                subject: rule.subject,
                body: rule.body,
                groupId: null,
                actions: {
                  deleteMany: {},
                  createMany: { data: mappedActions },
                },
              },
            });
            updatedCount++;
          } else {
            // Create new rule
            await prisma.rule.create({
              data: {
                emailAccountId,
                name: rule.name,
                systemType: rule.systemType,
                instructions: rule.instructions,
                enabled: rule.enabled ?? true,
                automate: rule.automate ?? true,
                runOnThreads: rule.runOnThreads ?? false,
                conditionalOperator: rule.conditionalOperator,
                categoryFilterType: rule.categoryFilterType,
                from: rule.from,
                to: rule.to,
                subject: rule.subject,
                body: rule.body,
                groupId: null,
                actions: { createMany: { data: mappedActions } },
              },
            });
            createdCount++;
          }
        } catch (error) {
          logger.error("Failed to import rule", { ruleName: rule.name, error });
          skippedCount++;
        }
      }

      logger.info("Import complete", {
        createdCount,
        updatedCount,
        skippedCount,
      });

      return { createdCount, updatedCount, skippedCount };
    },
  );
