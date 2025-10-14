"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
  createRuleBody,
  updateRuleBody,
  updateRuleSettingsBody,
  enableDraftRepliesBody,
  deleteRuleBody,
  createRulesOnboardingBody,
  type CategoryConfig,
  type CategoryAction,
  toggleRuleBody,
} from "@/utils/actions/rule.validation";
import prisma from "@/utils/prisma";
import { isDuplicateError, isNotFoundError } from "@/utils/prisma-helpers";
import { flattenConditions } from "@/utils/condition";
import {
  ActionType,
  LogicalOperator,
  type Rule,
  SystemType,
  type Prisma,
} from "@prisma/client";
import { sanitizeActionFields } from "@/utils/action-item";
import { deleteRule, safeCreateRule } from "@/utils/rule/rule";
import { SafeError } from "@/utils/error";
import {
  getRuleConfig,
  getSystemRuleActionTypes,
  getCategoryAction,
} from "@/utils/rule/consts";
import { actionClient } from "@/utils/actions/safe-action";
import { prefixPath } from "@/utils/path";
import { createRuleHistory } from "@/utils/rule/rule-history";
import { ONE_WEEK_MINUTES } from "@/utils/date";
import { createEmailProvider } from "@/utils/email/provider";
import { resolveLabelNameAndId } from "@/utils/label/resolve-label";
import type { Logger } from "@/utils/logger";

export const createRuleAction = actionClient
  .metadata({ name: "createRule" })
  .schema(createRuleBody)
  .action(
    async ({
      ctx: { emailAccountId, logger, provider },
      parsedInput: {
        name,
        runOnThreads,
        actions,
        conditions: conditionsInput,
        conditionalOperator,
        systemType,
      },
    }) => {
      const conditions = flattenConditions(conditionsInput);

      const resolvedActions = await resolveActionLabels(
        actions || [],
        emailAccountId,
        provider,
      );

      try {
        const rule = await prisma.rule.create({
          data: {
            name,
            runOnThreads: runOnThreads ?? undefined,
            actions: resolvedActions.length
              ? {
                  createMany: {
                    data: resolvedActions.map(mapActionToSanitizedFields),
                  },
                }
              : undefined,
            emailAccountId,
            conditionalOperator: conditionalOperator || LogicalOperator.AND,
            systemType: systemType || undefined,
            // conditions
            instructions: conditions.instructions || null,
            from: conditions.from || null,
            to: conditions.to || null,
            subject: conditions.subject || null,
            // body: conditions.body || null,
            categoryFilterType: conditions.categoryFilterType || null,
            categoryFilters:
              conditions.categoryFilterType && conditions.categoryFilters
                ? {
                    connect: conditions.categoryFilters.map((id) => ({ id })),
                  }
                : {},
          },
          include: { actions: true, categoryFilters: true, group: true },
        });

        // Track rule creation in history
        after(() =>
          createRuleHistory({ rule, triggerType: "manual_creation" }),
        );

        return { rule };
      } catch (error) {
        handleRuleError(error, logger);
      }
    },
  );

export const updateRuleAction = actionClient
  .metadata({ name: "updateRule" })
  .schema(updateRuleBody)
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
        systemType,
      },
    }) => {
      const conditions = flattenConditions(conditionsInput);

      const resolvedActions = await resolveActionLabels(
        actions,
        emailAccountId,
        provider,
      );

      try {
        const currentRule = await prisma.rule.findUnique({
          where: { id, emailAccountId },
          include: { actions: true, categoryFilters: true, group: true },
        });
        if (!currentRule) throw new SafeError("Rule not found");

        const currentActions = currentRule.actions;

        const actionsToDelete = currentActions.filter(
          (currentAction) =>
            !resolvedActions.find((a) => a.id === currentAction.id),
        );
        const actionsToUpdate = resolvedActions.filter((a) => a.id);
        const actionsToCreate = resolvedActions.filter((a) => !a.id);

        const [updatedRule] = await prisma.$transaction([
          // update rule
          prisma.rule.update({
            where: { id, emailAccountId },
            data: {
              runOnThreads: runOnThreads ?? undefined,
              name: name || undefined,
              conditionalOperator: conditionalOperator || LogicalOperator.AND,
              systemType: systemType || undefined,
              // conditions
              instructions: conditions.instructions || null,
              from: conditions.from || null,
              to: conditions.to || null,
              subject: conditions.subject || null,
              // body: conditions.body || null,
              categoryFilterType: conditions.categoryFilterType || null,
              categoryFilters:
                conditions.categoryFilterType && conditions.categoryFilters
                  ? {
                      set: conditions.categoryFilters.map((id) => ({ id })),
                    }
                  : { set: [] },
            },
            include: { actions: true, categoryFilters: true, group: true },
          }),
          // delete removed actions
          ...(actionsToDelete.length
            ? [
                prisma.action.deleteMany({
                  where: { id: { in: actionsToDelete.map((a) => a.id) } },
                }),
              ]
            : []),
          // update actions
          ...actionsToUpdate.map((a) =>
            prisma.action.update({
              where: { id: a.id },
              data: mapActionToSanitizedFields(a),
            }),
          ),
          // create new actions
          ...(actionsToCreate.length
            ? [
                prisma.action.createMany({
                  data: actionsToCreate.map((a) => ({
                    ...mapActionToSanitizedFields(a),
                    ruleId: id,
                  })),
                }),
              ]
            : []),
        ]);

        // Track rule update in history
        after(() =>
          createRuleHistory({
            rule: updatedRule,
            triggerType: "manual_update",
          }),
        );

        revalidatePath(prefixPath(emailAccountId, `/assistant/rule/${id}`));
        revalidatePath(prefixPath(emailAccountId, "/assistant"));
        revalidatePath(prefixPath(emailAccountId, "/automation"));

        return { rule: updatedRule };
      } catch (error) {
        handleRuleError(error, logger);
      }
    },
  );

export const updateRuleSettingsAction = actionClient
  .metadata({ name: "updateRuleSettings" })
  .schema(updateRuleSettingsBody)
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
  .schema(enableDraftRepliesBody)
  .action(
    async ({ ctx: { emailAccountId, provider }, parsedInput: { enable } }) => {
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

export const deleteRuleAction = actionClient
  .metadata({ name: "deleteRule" })
  .schema(deleteRuleBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    const rule = await prisma.rule.findUnique({
      where: { id, emailAccountId },
      include: { actions: true, categoryFilters: true, group: true },
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
  .schema(createRulesOnboardingBody)
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

      async function createRule(systemType: SystemType) {
        const ruleConfiguration = getRuleConfig(systemType);
        const { name, instructions, label, runOnThreads } = ruleConfiguration;
        const categoryAction = getCategoryAction(systemType, provider);

        const existingRule = systemType
          ? await prisma.rule.findUnique({
              where: {
                emailAccountId_systemType: { emailAccountId, systemType },
              },
            })
          : null;

        if (existingRule) {
          const promise = (async () => {
            const actions = await getActionsFromCategoryAction({
              emailAccountId,
              rule: existingRule,
              categoryAction,
              label,
              hasDigest: false,
              draftReply: !!ruleConfiguration.draftReply,
              provider,
            });

            return (
              prisma.rule
                .update({
                  where: { id: existingRule.id },
                  data: {
                    instructions,
                    actions: {
                      deleteMany: {},
                      createMany: { data: actions },
                    },
                  },
                })
                // NOTE: doesn't update without this line
                .then(() => {})
                .catch((error) => {
                  logger.error("Error updating rule", { error });
                  throw error;
                })
            );
          })();
          promises.push(promise);
        } else {
          const promise = (async () => {
            const actions = await getActionsFromCategoryAction({
              emailAccountId,
              rule: { name } as Rule, // Mock rule object for create operation
              categoryAction,
              label,
              hasDigest: false,
              draftReply: !!ruleConfiguration.draftReply,
              provider,
            });

            return prisma.rule
              .create({
                data: {
                  emailAccountId,
                  name,
                  instructions,
                  systemType: systemType ?? undefined,
                  runOnThreads,
                  actions: { createMany: { data: actions } },
                },
              })
              .then(() => {})
              .catch((error) => {
                if (isDuplicateError(error, "name")) return;
                logger.error("Error creating rule", { error });
                throw error;
              });
          })();
          promises.push(promise);
        }
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
          createRule(type);
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
          createRule(type);
        } else {
          deleteRule(type, emailAccountId);
        }
      }

      // Create rules for custom categories
      for (const customCategory of customCategories) {
        if (customCategory.action && isSet(customCategory.action)) {
          const actions = await getActionsFromCategoryAction({
            emailAccountId,
            rule: { name: customCategory.name } as Rule,
            categoryAction: customCategory.action,
            label: customCategory.name,
            hasDigest: false,
            draftReply: false,
            provider,
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
  .schema(toggleRuleBody)
  .action(
    async ({
      ctx: { emailAccountId, provider },
      parsedInput: { ruleId, systemType, enabled },
    }) => {
      await toggleRule({
        ruleId,
        systemType,
        enabled,
        emailAccountId,
        provider,
      });
    },
  );

async function toggleRule({
  ruleId,
  systemType,
  enabled,
  emailAccountId,
  provider,
}: {
  ruleId: string | undefined;
  systemType: SystemType | undefined;
  enabled: boolean;
  emailAccountId: string;
  provider: string;
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

  const actions: Array<{
    type: ActionType;
    labelId?: string | null;
    folderId?: string | null;
    fields: {
      label: string | null;
      to: string | null;
      subject: string | null;
      content: string | null;
      cc: string | null;
      bcc: string | null;
      webhookUrl: string | null;
      folderName: string | null;
    };
  }> = [];

  for (const actionType of actionTypes) {
    if (actionType.includeFolder) {
      const folderId = await emailProvider.getOrCreateOutlookFolderIdByName(
        ruleConfig.name,
      );
      actions.push({
        type: actionType.type,
        folderId,
        fields: createEmptyActionFields({ folderName: ruleConfig.name }),
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
        fields: createEmptyActionFields({ label: labelInfo.label }),
      });
    } else {
      actions.push({
        type: actionType.type,
        fields: createEmptyActionFields(),
      });
    }
  }

  const createdRule = await safeCreateRule({
    result: {
      name: ruleConfig.name,
      condition: {
        aiInstructions: ruleConfig.instructions,
        conditionalOperator: null,
        static: null,
      },
      actions,
    },
    emailAccountId,
    systemType,
    triggerType: "manual_creation",
    shouldCreateIfDuplicate: true,
    provider,
    runOnThreads: ruleConfig.runOnThreads,
  });

  if (!createdRule) {
    throw new SafeError("Failed to create rule");
  }

  return createdRule;
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

function createEmptyActionFields(
  overrides: { label?: string | null; folderName?: string | null } = {},
) {
  return {
    label: overrides.label ?? null,
    to: null,
    subject: null,
    content: null,
    cc: null,
    bcc: null,
    webhookUrl: null,
    folderName: overrides.folderName ?? null,
  };
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
  rule,
  categoryAction,
  label,
  draftReply,
  hasDigest,
  provider,
}: {
  emailAccountId: string;
  rule: Rule;
  categoryAction: CategoryAction;
  label: string;
  hasDigest: boolean;
  draftReply: boolean;
  provider: string;
}): Promise<Prisma.ActionCreateManyRuleInput[]> {
  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
  });

  const { label: labelName, labelId } = await resolveLabelNameAndId({
    emailProvider,
    label,
    labelId: null,
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
      const folderId = await emailProvider.getOrCreateOutlookFolderIdByName(
        rule.name,
      );
      actions = [
        {
          type: ActionType.MOVE_FOLDER,
          folderId,
          folderName: rule.name,
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
