"use server";

import { revalidatePath } from "next/cache";
import {
  createRuleBody,
  updateRuleBody,
  updateRuleInstructionsBody,
  rulesExamplesBody,
  updateRuleSettingsBody,
  createRulesOnboardingBody,
  enableDraftRepliesBody,
  deleteRuleBody,
} from "@/utils/actions/rule.validation";
import prisma, { isDuplicateError, isNotFoundError } from "@/utils/prisma";
import { aiFindExampleMatches } from "@/utils/ai/example-matches/find-example-matches";
import { flattenConditions } from "@/utils/condition";
import {
  ActionType,
  ColdEmailSetting,
  LogicalOperator,
  SystemType,
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
  enableDraftReplies,
  enableReplyTracker,
} from "@/utils/reply-tracker/enable";
import { env } from "@/env";
import { INTERNAL_API_KEY_HEADER } from "@/utils/internal-api";
import type { ProcessPreviousBody } from "@/app/api/reply-tracker/process-previous/route";
import { RuleName } from "@/utils/rule/consts";
import { actionClient } from "@/utils/actions/safe-action";
import { getGmailClientForEmail } from "@/utils/account";

const logger = createScopedLogger("actions/rule");

export const createRuleAction = actionClient
  .metadata({ name: "createRule" })
  .schema(createRuleBody)
  .action(
    async ({
      ctx: { email },
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
                      ({ type, label, subject, content, to, cc, bcc, url }) => {
                        return sanitizeActionFields({
                          type,
                          label: label?.value,
                          subject: subject?.value,
                          content: content?.value,
                          to: to?.value,
                          cc: cc?.value,
                          bcc: bcc?.value,
                          url: url?.value,
                        });
                      },
                    ),
                  },
                }
              : undefined,
            emailAccount: { connect: { email } },
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

        await updatePromptFileOnRuleCreated({ email, rule });

        revalidatePath("/automation");

        return { rule };
      } catch (error) {
        if (isDuplicateError(error, "name")) {
          return { error: "Rule name already exists" };
        }
        if (isDuplicateError(error, "groupId")) {
          return {
            error: "Group already has a rule. Please use the existing rule.",
          };
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
      ctx: { email },
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
          where: { id, emailAccountId: email },
          include: { actions: true, categoryFilters: true, group: true },
        });
        if (!currentRule) return { error: "Rule not found" };

        const currentActions = currentRule.actions;

        const actionsToDelete = currentActions.filter(
          (currentAction) => !actions.find((a) => a.id === currentAction.id),
        );
        const actionsToUpdate = actions.filter((a) => a.id);
        const actionsToCreate = actions.filter((a) => !a.id);

        const [updatedRule] = await prisma.$transaction([
          // update rule
          prisma.rule.update({
            where: { id, emailAccountId: email },
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
          // update existing actions
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
                      }),
                      ruleId: id,
                    };
                  }),
                }),
              ]
            : []),
        ]);

        // update prompt file
        await updatePromptFileOnRuleUpdated({
          email,
          currentRule,
          updatedRule,
        });

        revalidatePath(`/automation/rule/${id}`);
        revalidatePath("/automation");

        return { rule: updatedRule };
      } catch (error) {
        if (isDuplicateError(error, "name")) {
          return { error: "Rule name already exists" };
        }
        if (isDuplicateError(error, "groupId")) {
          return {
            error: "Group already has a rule. Please use the existing rule.",
          };
        }

        logger.error("Error updating rule", { error });
        throw new SafeError("Error updating rule");
      }
    },
  );

export const updateRuleInstructionsAction = actionClient
  .metadata({ name: "updateRuleInstructions" })
  .schema(updateRuleInstructionsBody)
  .action(async ({ ctx: { email }, parsedInput: { id, instructions } }) => {
    const currentRule = await prisma.rule.findUnique({
      where: { id, emailAccountId: email },
      include: { actions: true, categoryFilters: true, group: true },
    });
    if (!currentRule) return { error: "Rule not found" };

    await updateRuleInstructionsAndPromptFile({
      email,
      ruleId: id,
      instructions,
      currentRule,
    });

    revalidatePath(`/automation/rule/${id}`);
    revalidatePath("/automation");
  });

export const updateRuleSettingsAction = actionClient
  .metadata({ name: "updateRuleSettings" })
  .schema(updateRuleSettingsBody)
  .action(async ({ ctx: { email }, parsedInput: { id, instructions } }) => {
    const currentRule = await prisma.rule.findUnique({
      where: { id, emailAccountId: email },
    });
    if (!currentRule) return { error: "Rule not found" };

    await prisma.rule.update({
      where: { id, emailAccountId: email },
      data: { instructions },
    });

    revalidatePath(`/automation/rule/${id}`);
    revalidatePath("/automation");
    revalidatePath("/reply-zero");
  });

export const enableDraftRepliesAction = actionClient
  .metadata({ name: "enableDraftReplies" })
  .schema(enableDraftRepliesBody)
  .action(async ({ ctx: { email }, parsedInput: { enable } }) => {
    const rule = await prisma.rule.findUnique({
      where: {
        emailAccountId_systemType: {
          emailAccountId: email,
          systemType: SystemType.TO_REPLY,
        },
      },
      select: { id: true, actions: true },
    });
    if (!rule) return { error: "Rule not found" };

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

    revalidatePath(`/automation/rule/${rule.id}`);
    revalidatePath("/automation");
    revalidatePath("/reply-zero");
  });

export const deleteRuleAction = actionClient
  .metadata({ name: "deleteRule" })
  .schema(deleteRuleBody)
  .action(async ({ ctx: { email }, parsedInput: { id } }) => {
    const rule = await prisma.rule.findUnique({
      where: { id, emailAccountId: email },
      include: { actions: true, categoryFilters: true, group: true },
    });
    if (!rule) return; // already deleted
    if (rule.emailAccountId !== email)
      return { error: "You don't have permission to delete this rule" };

    try {
      await deleteRule({
        ruleId: id,
        email,
        groupId: rule.groupId,
      });

      const emailAccount = await prisma.emailAccount.findUnique({
        where: { email },
        select: {
          userId: true,
          email: true,
          about: true,
          aiModel: true,
          aiProvider: true,
          aiApiKey: true,
          rulesPrompt: true,
        },
      });
      if (!emailAccount) return { error: "User not found" };

      if (!emailAccount.rulesPrompt) return;

      const updatedPrompt = await generatePromptOnDeleteRule({
        user: emailAccount,
        existingPrompt: emailAccount.rulesPrompt,
        deletedRule: rule,
      });

      await prisma.emailAccount.update({
        where: { email },
        data: { rulesPrompt: updatedPrompt },
      });

      revalidatePath(`/automation/rule/${id}`);
      revalidatePath("/automation");
    } catch (error) {
      if (isNotFoundError(error)) return;
      throw error;
    }
  });

export const getRuleExamplesAction = actionClient
  .metadata({ name: "getRuleExamples" })
  .schema(rulesExamplesBody)
  .action(
    async ({ ctx: { email, emailAccount }, parsedInput: { rulesPrompt } }) => {
      if (!emailAccount) throw new SafeError("Email account not found");

      const gmail = await getGmailClientForEmail({ email });

      const { matches } = await aiFindExampleMatches(
        emailAccount,
        gmail,
        rulesPrompt,
      );

      return { matches };
    },
  );

export const createRulesOnboardingAction = actionClient
  .metadata({ name: "createRulesOnboarding" })
  .schema(createRulesOnboardingBody)
  .action(
    async ({
      ctx: { email },
      parsedInput: {
        newsletter,
        coldEmail,
        toReply,
        marketing,
        calendar,
        receipt,
        notification,
      },
    }) => {
      const user = await prisma.emailAccount.findUnique({
        where: { email },
        select: { rulesPrompt: true },
      });
      if (!user) return { error: "User not found" };

      const promises: Promise<any>[] = [];

      const isSet = (value: string): value is "label" | "label_archive" =>
        value !== "none";

      // cold email blocker
      if (isSet(coldEmail)) {
        const promise = prisma.emailAccount.update({
          where: { email },
          data: {
            coldEmailBlocker:
              coldEmail === "label"
                ? ColdEmailSetting.LABEL
                : ColdEmailSetting.ARCHIVE_AND_LABEL,
          },
        });
        promises.push(promise);
      }

      const rules: string[] = [];

      // reply tracker
      if (isSet(toReply)) {
        const promise = enableReplyTracker({ email }).then((res) => {
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
              body: JSON.stringify({ email } satisfies ProcessPreviousBody),
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
        categoryAction: "label" | "label_archive",
        label: string,
        systemType: SystemType,
        emailAccountId: string,
      ) {
        const existingRule = await prisma.rule.findUnique({
          where: { emailAccountId_systemType: { emailAccountId, systemType } },
        });

        if (existingRule) {
          const promise = prisma.rule
            .update({
              where: { id: existingRule.id },
              data: {
                instructions,
                actions: {
                  deleteMany: {},
                  createMany: {
                    data: [
                      { type: ActionType.LABEL, label },
                      ...(categoryAction === "label_archive"
                        ? [{ type: ActionType.ARCHIVE }]
                        : []),
                    ],
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
                systemType,
                automate: true,
                runOnThreads,
                actions: {
                  createMany: {
                    data: [
                      { type: ActionType.LABEL, label: "Newsletter" },
                      ...(categoryAction === "label_archive"
                        ? [{ type: ActionType.ARCHIVE }]
                        : []),
                    ],
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
            `${promptFileInstructions}${
              categoryAction === "label_archive" ? " and archive them" : ""
            }.`,
          );
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

      // newsletter
      if (isSet(newsletter)) {
        createRule(
          RuleName.Newsletter,
          "Newsletters: Regular content from publications, blogs, or services I've subscribed to",
          "Label all newsletters as 'Newsletter'",
          false,
          newsletter,
          "Newsletter",
          SystemType.NEWSLETTER,
          email,
        );
      } else {
        deleteRule(SystemType.NEWSLETTER, email);
      }

      // marketing
      if (isSet(marketing)) {
        createRule(
          RuleName.Marketing,
          "Marketing: Promotional emails about products, services, sales, or offers",
          "Label all marketing emails as 'Marketing'",
          false,
          marketing,
          "Marketing",
          SystemType.MARKETING,
          email,
        );
      } else {
        deleteRule(SystemType.MARKETING, email);
      }

      // calendar
      if (isSet(calendar)) {
        createRule(
          RuleName.Calendar,
          "Calendar: Any email related to scheduling, meeting invites, or calendar notifications",
          "Label all calendar emails as 'Calendar'",
          false,
          calendar,
          "Calendar",
          SystemType.CALENDAR,
          email,
        );
      } else {
        deleteRule(SystemType.CALENDAR, email);
      }

      // receipt
      if (isSet(receipt)) {
        createRule(
          RuleName.Receipt,
          "Receipts: Purchase confirmations, payment receipts, transaction records or invoices",
          "Label all receipts as 'Receipts'",
          false,
          receipt,
          "Receipt",
          SystemType.RECEIPT,
          email,
        );
      } else {
        deleteRule(SystemType.RECEIPT, email);
      }

      // notification
      if (isSet(notification)) {
        createRule(
          RuleName.Notification,
          "Notifications: Alerts, status updates, or system messages",
          "Label all notifications as 'Notifications'",
          false,
          notification,
          "Notification",
          SystemType.NOTIFICATION,
          email,
        );
      } else {
        deleteRule(SystemType.NOTIFICATION, email);
      }

      await Promise.allSettled(promises);

      await prisma.emailAccount.update({
        where: { email },
        data: {
          rulesPrompt:
            `${user.rulesPrompt || ""}\n${rules.map((r) => `* ${r}`).join("\n")}`.trim(),
        },
      });
    },
  );
