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
  createToReplyRule,
  enableDraftReplies,
} from "@/utils/reply-tracker/enable";
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
                    data: resolvedActions.map(
                      ({
                        type,
                        labelId,
                        subject,
                        content,
                        to,
                        cc,
                        bcc,
                        url,
                        folderName,
                        delayInMinutes,
                      }) => {
                        return sanitizeActionFields({
                          type,
                          label: labelId?.name,
                          labelId: labelId?.value,
                          subject: subject?.value,
                          content: content?.value,
                          to: to?.value,
                          cc: cc?.value,
                          bcc: bcc?.value,
                          url: url?.value,
                          folderName: folderName?.value,
                          delayInMinutes,
                        });
                      },
                    ),
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
        if (isDuplicateError(error, "name")) {
          throw new SafeError("Rule name already exists");
        }
        if (isDuplicateError(error, "groupId")) {
          throw new SafeError(
            "Group already has a rule. Please use the existing rule.",
          );
        }

        logger.error("Error creating rule", { error });
        throw new SafeError("Error creating rule");
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
          ...actionsToUpdate.map((a) => {
            return prisma.action.update({
              where: { id: a.id },
              data: sanitizeActionFields({
                type: a.type,
                label: a.labelId?.name,
                labelId: a.labelId?.value,
                subject: a.subject?.value,
                content: a.content?.value,
                to: a.to?.value,
                cc: a.cc?.value,
                bcc: a.bcc?.value,
                url: a.url?.value,
                folderName: a.folderName?.value,
                delayInMinutes: a.delayInMinutes,
              }),
            });
          }),
          // create new actions
          ...(actionsToCreate.length
            ? [
                prisma.action.createMany({
                  data: actionsToCreate.map((a) => {
                    return {
                      ...sanitizeActionFields({
                        type: a.type,
                        label: a.labelId?.name,
                        labelId: a.labelId?.value,
                        subject: a.subject?.value,
                        content: a.content?.value,
                        to: a.to?.value,
                        cc: a.cc?.value,
                        bcc: a.bcc?.value,
                        url: a.url?.value,
                        folderName: a.folderName?.value,
                        delayInMinutes: a.delayInMinutes,
                      }),
                      ruleId: id,
                    };
                  }),
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
        if (isDuplicateError(error, "name")) {
          throw new SafeError("Rule name already exists");
        }
        if (isDuplicateError(error, "groupId")) {
          throw new SafeError(
            "Group already has a rule. Please use the existing rule.",
          );
        }

        logger.error("Error updating rule", { error });
        throw new SafeError("Error updating rule");
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

      revalidatePath(prefixPath(emailAccountId, `/assistant/rule/${id}`));
      revalidatePath(prefixPath(emailAccountId, "/assistant"));
      revalidatePath(prefixPath(emailAccountId, "/automation"));
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

      if (!rule) {
        const newRule = await createToReplyRule(
          emailAccountId,
          false,
          provider,
        );

        if (!newRule) {
          throw new SafeError("Failed to create To Reply rule");
        }

        rule = newRule;
      }

      if (enable) {
        await enableDraftReplies(rule);
      } else {
        await prisma.action.deleteMany({
          where: {
            ruleId: rule.id,
            type: ActionType.DRAFT_EMAIL,
          },
        });
      }

      revalidatePath(prefixPath(emailAccountId, "/assistant"));
      revalidatePath(prefixPath(emailAccountId, "/automation"));
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

      const rules: string[] = [];

      async function createRule(systemType: SystemType) {
        const ruleConfiguration = getRuleConfig(systemType);

        const name = ruleConfiguration.name;
        const instructions = ruleConfiguration.instructions;
        const label = ruleConfiguration.label;
        const runOnThreads = ruleConfiguration.runOnThreads;
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

      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          rulesPrompt: `${emailAccount.rulesPrompt || ""}\n${rules
            .map((r) => `* ${r}`)
            .join("\n")}`.trim(),
        },
      });
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
      if (ruleId) {
        await prisma.rule.update({
          where: { id: ruleId, emailAccountId },
          data: { enabled },
        });
        return;
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
        await prisma.rule.update({
          where: { id: existingRule.id },
          data: { enabled },
        });
        return;
      }

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
      });

      const ruleConfig = getRuleConfig(systemType);
      const actionTypes = getSystemRuleActionTypes(systemType, provider);

      // Build actions based on system rule config
      const actions: Array<{
        type: ActionType;
        labelId?: string | null;
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
          await emailProvider.getOrCreateOutlookFolderIdByName(ruleConfig.name);
          actions.push({
            type: actionType.type,
            fields: {
              folderName: ruleConfig.name,
              label: null,
              to: null,
              subject: null,
              content: null,
              cc: null,
              bcc: null,
              webhookUrl: null,
            },
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
          });
        } else {
          actions.push({
            type: actionType.type,
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
      });

      if (!createdRule) {
        throw new SafeError("Failed to create rule");
      }
    },
  );

async function resolveActionLabels<
  T extends {
    type: ActionType;
    labelId?: {
      name?: string | null;
      value?: string | null;
      ai?: boolean | null;
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
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
      });
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
