"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
  createRuleBody,
  updateRuleBody,
  updateRuleInstructionsBody,
  rulesExamplesBody,
  updateRuleSettingsBody,
  enableDraftRepliesBody,
  deleteRuleBody,
  createRulesOnboardingBody,
  type CategoryConfig,
  type CategoryAction,
} from "@/utils/actions/rule.validation";
import prisma from "@/utils/prisma";
import { isDuplicateError, isNotFoundError } from "@/utils/prisma-helpers";
import { aiFindExampleMatches } from "@/utils/ai/example-matches/find-example-matches";
import { flattenConditions } from "@/utils/condition";
import {
  ActionType,
  ColdEmailSetting,
  LogicalOperator,
  type Rule,
  SystemType,
  type Prisma,
} from "@prisma/client";
import {
  updatePromptFileOnRuleUpdated,
  updateRuleInstructionsAndPromptFile,
  updatePromptFileOnRuleCreated,
} from "@/utils/rule/prompt-file";
import { generatePromptOnDeleteRule } from "@/utils/ai/rule/generate-prompt-on-delete-rule";
import { sanitizeActionFields } from "@/utils/action-item";
import { deleteRule } from "@/utils/rule/rule";
import { createScopedLogger } from "@/utils/logger";
import { SafeError } from "@/utils/error";
import {
  createToReplyRule,
  enableDraftReplies,
  enableReplyTracker,
} from "@/utils/reply-tracker/enable";
import { env } from "@/env";
import { INTERNAL_API_KEY_HEADER } from "@/utils/internal-api";
import type { ProcessPreviousBody } from "@/app/api/reply-tracker/process-previous/route";
import { RuleName, SystemRule } from "@/utils/rule/consts";
import { actionClient } from "@/utils/actions/safe-action";
import {
  getGmailClientForEmail,
  getOutlookClientForEmail,
} from "@/utils/account";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { prefixPath } from "@/utils/path";
import { createRuleHistory } from "@/utils/rule/rule-history";
import { ONE_WEEK_MINUTES } from "@/utils/date";
import { getOrCreateOutlookFolderIdByName } from "@/utils/outlook/folders";

const logger = createScopedLogger("actions/rule");

function getCategoryActionDescription(categoryAction: CategoryAction): string {
  switch (categoryAction) {
    case "label_archive":
      return " and archive them";
    case "label_archive_delayed":
      return " and archive them after a week";
    case "label_move_folder":
      return " and move them to a folder";
    case "label_move_folder_delayed":
      return " and move them to a folder after a week";
    default:
      return "";
  }
}

async function getActionsFromCategoryAction(
  emailAccountId: string,
  rule: Rule,
  categoryAction: CategoryAction,
  label: string,
  hasDigest: boolean,
): Promise<Prisma.ActionCreateManyRuleInput[]> {
  const actions: Prisma.ActionCreateManyRuleInput[] = [
    { type: ActionType.LABEL, label },
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
    case "label_move_folder":
    case "label_move_folder_delayed": {
      const outlook = await getOutlookClientForEmail({ emailAccountId });
      const folderId = await getOrCreateOutlookFolderIdByName(
        outlook,
        rule.name,
      );
      actions.push({
        type: ActionType.MOVE_FOLDER,
        folderId,
        folderName: rule.name,
        delayInMinutes:
          categoryAction === "label_move_folder_delayed"
            ? ONE_WEEK_MINUTES
            : undefined,
      });
      break;
    }
  }

  if (hasDigest) {
    actions.push({ type: ActionType.DIGEST });
  }

  return actions;
}

export const createRuleAction = actionClient
  .metadata({ name: "createRule" })
  .schema(createRuleBody)
  .action(
    async ({
      ctx: { emailAccountId, provider },
      parsedInput: {
        name,
        automate,
        runOnThreads,
        actions,
        conditions: conditionsInput,
        conditionalOperator,
        systemType,
      },
    }) => {
      const conditions = flattenConditions(conditionsInput);

      try {
        const rule = await prisma.rule.create({
          data: {
            name,
            automate: automate ?? undefined,
            runOnThreads: runOnThreads ?? undefined,
            actions: actions
              ? {
                  createMany: {
                    data: actions.map(
                      ({
                        type,
                        label,
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
                          label: label?.value,
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

        after(() =>
          updatePromptFileOnRuleCreated({
            emailAccountId,
            provider,
            rule,
          }),
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
      ctx: { emailAccountId },
      parsedInput: {
        id,
        name,
        automate,
        runOnThreads,
        actions,
        conditions: conditionsInput,
        conditionalOperator,
        systemType,
      },
    }) => {
      const conditions = flattenConditions(conditionsInput);

      try {
        const currentRule = await prisma.rule.findUnique({
          where: { id, emailAccountId },
          include: { actions: true, categoryFilters: true, group: true },
        });
        if (!currentRule) throw new SafeError("Rule not found");

        const currentActions = currentRule.actions;

        const actionsToDelete = currentActions.filter(
          (currentAction) => !actions.find((a) => a.id === currentAction.id),
        );
        const actionsToUpdate = actions.filter((a) => a.id);
        const actionsToCreate = actions.filter((a) => !a.id);

        const [updatedRule] = await prisma.$transaction([
          // update rule
          prisma.rule.update({
            where: { id, emailAccountId },
            data: {
              automate: automate ?? undefined,
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
                label: a.label?.value,
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
                        label: a.label?.value,
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

        // update prompt file
        after(() =>
          updatePromptFileOnRuleUpdated({
            emailAccountId,
            currentRule,
            updatedRule,
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

export const updateRuleInstructionsAction = actionClient
  .metadata({ name: "updateRuleInstructions" })
  .schema(updateRuleInstructionsBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { id, instructions } }) => {
      const currentRule = await prisma.rule.findUnique({
        where: { id, emailAccountId },
        include: { actions: true, categoryFilters: true, group: true },
      });
      if (!currentRule) throw new SafeError("Rule not found");

      after(() =>
        updateRuleInstructionsAndPromptFile({
          emailAccountId,
          ruleId: id,
          instructions,
          currentRule,
        }),
      );

      revalidatePath(prefixPath(emailAccountId, `/assistant/rule/${id}`));
      revalidatePath(prefixPath(emailAccountId, "/assistant"));
      revalidatePath(prefixPath(emailAccountId, "/automation"));
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
  .action(
    async ({ ctx: { emailAccountId, provider }, parsedInput: { id } }) => {
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

        after(async () => {
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
                  aiModel: true,
                  aiProvider: true,
                  aiApiKey: true,
                },
              },
            },
          });
          if (!emailAccount) throw new SafeError("User not found");

          if (!emailAccount.rulesPrompt) return;

          const updatedPrompt = await generatePromptOnDeleteRule({
            emailAccount: { ...emailAccount, account: { provider } },
            existingPrompt: emailAccount.rulesPrompt,
            deletedRule: rule,
          });

          await prisma.emailAccount.update({
            where: { id: emailAccountId },
            data: { rulesPrompt: updatedPrompt },
          });
        });
      } catch (error) {
        if (isNotFoundError(error)) return;
        throw error;
      }
    },
  );

export const getRuleExamplesAction = actionClient
  .metadata({ name: "getRuleExamples" })
  .schema(rulesExamplesBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { rulesPrompt } }) => {
    const emailAccount = await getEmailAccountWithAi({ emailAccountId });
    if (!emailAccount) throw new SafeError("Email account not found");

    const gmail = await getGmailClientForEmail({ emailAccountId });

    const { matches } = await aiFindExampleMatches(
      emailAccount,
      gmail,
      rulesPrompt,
    );

    return { matches };
  });

export const createRulesOnboardingAction = actionClient
  .metadata({ name: "createRulesOnboarding" })
  .schema(createRulesOnboardingBody)
  .action(async ({ ctx: { emailAccountId, provider }, parsedInput }) => {
    const systemCategoryMap: Record<SystemRule, CategoryConfig> = {};
    const customCategories: CategoryConfig[] = [];

    for (const category of parsedInput) {
      if (category.key) {
        systemCategoryMap[category.key] = category;
      } else {
        customCategories.push(category);
      }
    }

    const newsletter = systemCategoryMap[SystemRule.Newsletter];
    const coldEmail = systemCategoryMap[SystemRule.ColdEmail];
    const toReply = systemCategoryMap[SystemRule.ToReply];
    const marketing = systemCategoryMap[SystemRule.Marketing];
    const calendar = systemCategoryMap[SystemRule.Calendar];
    const receipt = systemCategoryMap[SystemRule.Receipt];
    const notification = systemCategoryMap[SystemRule.Notification];

    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { rulesPrompt: true },
    });
    if (!emailAccount) throw new SafeError("User not found");

    const promises: Promise<any>[] = [];

    const isSet = (
      value: string | undefined | null,
    ): value is "label" | "label_archive" | "label_archive_delayed" =>
      value !== "none" && value !== undefined;

    // cold email blocker
    if (coldEmail && isSet(coldEmail.action)) {
      const promise = prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          coldEmailBlocker:
            coldEmail.action === "label"
              ? ColdEmailSetting.LABEL
              : ColdEmailSetting.ARCHIVE_AND_LABEL,
          coldEmailDigest: coldEmail.hasDigest ?? false,
        },
      });
      promises.push(promise);
    }

    const rules: string[] = [];

    // reply tracker
    if (toReply && isSet(toReply.action)) {
      const promise = enableReplyTracker({
        emailAccountId,
        addDigest: toReply.hasDigest ?? false,
        provider,
      }).then((res) => {
        if (res?.alreadyEnabled) return;

        // Load previous emails needing replies in background
        // This can take a while
        fetch(
          `${env.NEXT_PUBLIC_BASE_URL}/api/reply-tracker/process-previous`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [INTERNAL_API_KEY_HEADER]: env.INTERNAL_API_KEY,
            },
            body: JSON.stringify({
              emailAccountId,
            } satisfies ProcessPreviousBody),
          },
        );
      });
      promises.push(promise);
    }

    // regular categories
    async function createRule(
      name: string,
      instructions: string,
      promptFileInstructions: string,
      runOnThreads: boolean,
      categoryAction:
        | "label"
        | "label_archive"
        | "label_archive_delayed"
        | "label_move_folder"
        | "label_move_folder_delayed",
      label: string,
      systemType: SystemType | null,
      emailAccountId: string,
      hasDigest: boolean,
    ) {
      const existingRule = systemType
        ? await prisma.rule.findUnique({
            where: {
              emailAccountId_systemType: { emailAccountId, systemType },
            },
          })
        : null;

      if (existingRule) {
        const promise = prisma.rule
          .update({
            where: { id: existingRule.id },
            data: {
              instructions,
              actions: {
                deleteMany: {},
                createMany: {
                  data: await getActionsFromCategoryAction(
                    emailAccountId,
                    existingRule,
                    categoryAction,
                    label,
                    hasDigest,
                  ),
                },
              },
            },
          })
          // NOTE: doesn't update without this line
          .then(() => {})
          .catch((error) => {
            logger.error("Error updating rule", { error });
            throw error;
          });
        promises.push(promise);

        // TODO: prompt file update
      } else {
        const promise = prisma.rule
          .create({
            data: {
              emailAccountId,
              name,
              instructions,
              systemType: systemType ?? undefined,
              automate: true,
              runOnThreads,
              actions: {
                createMany: {
                  data: await getActionsFromCategoryAction(
                    emailAccountId,
                    { name } as Rule, // Mock rule object for create operation
                    categoryAction,
                    label,
                    hasDigest,
                  ),
                },
              },
            },
          })
          .then(() => {})
          .catch((error) => {
            if (isDuplicateError(error, "name")) return;
            logger.error("Error creating rule", { error });
            throw error;
          });
        promises.push(promise);

        rules.push(
          `${promptFileInstructions}${getCategoryActionDescription(categoryAction)}.`,
        );
      }
    }

    async function deleteRule(systemType: SystemType, emailAccountId: string) {
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

    // newsletter
    if (newsletter && isSet(newsletter.action)) {
      createRule(
        RuleName.Newsletter,
        "Newsletters: Regular content from publications, blogs, or services I've subscribed to",
        "Label all newsletters as @[Newsletter]",
        false,
        newsletter.action,
        "Newsletter",
        SystemType.NEWSLETTER,
        emailAccountId,
        !!newsletter.hasDigest,
      );
    } else {
      deleteRule(SystemType.NEWSLETTER, emailAccountId);
    }

    // marketing
    if (marketing && isSet(marketing.action)) {
      createRule(
        RuleName.Marketing,
        "Marketing: Promotional emails about products, services, sales, or offers",
        "Label all marketing emails as @[Marketing]",
        false,
        marketing.action,
        "Marketing",
        SystemType.MARKETING,
        emailAccountId,
        !!marketing.hasDigest,
      );
    } else {
      deleteRule(SystemType.MARKETING, emailAccountId);
    }

    // calendar
    if (calendar && isSet(calendar.action)) {
      createRule(
        RuleName.Calendar,
        "Calendar: Any email related to scheduling, meeting invites, or calendar notifications",
        "Label all calendar emails as @[Calendar]",
        false,
        calendar.action,
        "Calendar",
        SystemType.CALENDAR,
        emailAccountId,
        !!calendar.hasDigest,
      );
    } else {
      deleteRule(SystemType.CALENDAR, emailAccountId);
    }

    // receipt
    if (receipt && isSet(receipt.action)) {
      createRule(
        RuleName.Receipt,
        "Receipts: Purchase confirmations, payment receipts, transaction records or invoices",
        "Label all receipts as @[Receipt]",
        false,
        receipt.action,
        "Receipt",
        SystemType.RECEIPT,
        emailAccountId,
        !!receipt.hasDigest,
      );
    } else {
      deleteRule(SystemType.RECEIPT, emailAccountId);
    }

    // notification
    if (notification && isSet(notification.action)) {
      createRule(
        RuleName.Notification,
        "Notifications: Alerts, status updates, or system messages",
        "Label all notifications as @[Notifications]",
        false,
        notification.action,
        "Notification",
        SystemType.NOTIFICATION,
        emailAccountId,
        !!notification.hasDigest,
      );
    } else {
      deleteRule(SystemType.NOTIFICATION, emailAccountId);
    }

    // Create rules for custom categories
    for (const customCategory of customCategories) {
      if (customCategory.action && isSet(customCategory.action)) {
        createRule(
          customCategory.name,
          customCategory.description ||
            `Custom category: ${customCategory.name}`,
          `Label all emails that match "${customCategory.description || customCategory.name}" as @[${customCategory.name}]`,
          false,
          customCategory.action,
          customCategory.name,
          null, // No systemType for custom categories
          emailAccountId,
          !!customCategory.hasDigest,
        );
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
  });

export async function getRuleNameByExecutedAction(
  actionId: string,
): Promise<string | undefined> {
  const executedAction = await prisma.executedAction.findUnique({
    where: { id: actionId },
    select: {
      executedRule: {
        select: {
          rule: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!executedAction) {
    throw new Error("Executed action not found");
  }

  return executedAction.executedRule?.rule?.name;
}
