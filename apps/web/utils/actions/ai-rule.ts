"use server";

import { z } from "zod";
import prisma from "@/utils/prisma";
import { isNotFoundError, isDuplicateError } from "@/utils/prisma-helpers";
import {
  runRules,
  type RunRulesResult,
} from "@/utils/ai/choose-rule/run-rules";
import { emailToContent } from "@/utils/mail";
import {
  runRulesBody,
  testAiCustomContentBody,
} from "@/utils/actions/ai-rule.validation";
import {
  createRulesBody,
  saveRulesPromptBody,
} from "@/utils/actions/rule.validation";
import { aiPromptToRules } from "@/utils/ai/rule/prompt-to-rules";
import { aiDiffRules } from "@/utils/ai/rule/diff-rules";
import { aiFindExistingRules } from "@/utils/ai/rule/find-existing-rules";
import { aiGenerateRulesPrompt } from "@/utils/ai/rule/generate-rules-prompt";
import { aiFindSnippets } from "@/utils/ai/snippets/find-snippets";
import { createRule, updateRule, deleteRule } from "@/utils/rule/rule";
import { actionClient } from "@/utils/actions/safe-action";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import { aiPromptToRulesOld } from "@/utils/ai/rule/prompt-to-rules-old";
import type { CreateRuleResult } from "@/utils/rule/types";

export const runRulesAction = actionClient
  .metadata({ name: "runRules" })
  .inputSchema(runRulesBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger: ctxLogger },
      parsedInput: { messageId, threadId, rerun, isTest },
    }): Promise<RunRulesResult[]> => {
      const logger = ctxLogger.with({ messageId, threadId });

      const emailAccount = await getEmailAccountWithAi({ emailAccountId });

      if (!emailAccount) throw new Error("Email account not found");
      if (!provider) throw new Error("Provider not found");

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });
      const message = await emailProvider.getMessage(messageId);

      const fetchExecutedRule = !isTest && !rerun;

      const executedRules = fetchExecutedRule
        ? await prisma.executedRule.findMany({
            where: {
              emailAccountId,
              threadId,
              messageId,
            },
            select: {
              id: true,
              reason: true,
              actionItems: true,
              rule: true,
              createdAt: true,
              status: true,
            },
          })
        : [];

      if (executedRules.length > 0) {
        logger.info("Skipping. Rule already exists.");

        return executedRules.map((executedRule) => ({
          rule: executedRule.rule,
          actionItems: executedRule.actionItems,
          reason: executedRule.reason,
          existing: true,
          createdAt: executedRule.createdAt,
          status: executedRule.status,
        }));
      }

      const rules = await prisma.rule.findMany({
        where: {
          emailAccountId,
          enabled: true,
        },
        include: { actions: true },
      });

      const result = await runRules({
        isTest,
        provider: emailProvider,
        message,
        rules,
        emailAccount,
        logger,
        modelType: "chat",
      });

      return result;
    },
  );

export const testAiCustomContentAction = actionClient
  .metadata({ name: "testAiCustomContent" })
  .inputSchema(testAiCustomContentBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { content },
    }) => {
      const emailAccount = await getEmailAccountWithAi({ emailAccountId });

      if (!emailAccount) throw new SafeError("Email account not found");

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      const rules = await prisma.rule.findMany({
        where: {
          emailAccountId,
          enabled: true,
          instructions: { not: null },
        },
        include: { actions: true },
      });

      const result = await runRules({
        isTest: true,
        provider: emailProvider,
        logger,
        message: {
          id: "testMessageId",
          threadId: "testThreadId",
          snippet: content,
          textPlain: content,
          headers: {
            date: new Date().toISOString(),
            from: "",
            to: "",
            subject: "",
          },
          historyId: "",
          inline: [],
          internalDate: new Date().toISOString(),
          subject: "",
          date: new Date().toISOString(),
        },
        rules,
        emailAccount,
        modelType: "chat",
      });

      return result;
    },
  );

export const setRuleRunOnThreadsAction = actionClient
  .metadata({ name: "setRuleRunOnThreads" })
  .inputSchema(z.object({ ruleId: z.string(), runOnThreads: z.boolean() }))
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { ruleId, runOnThreads },
    }) => {
      await prisma.rule.update({
        where: { id: ruleId, emailAccountId },
        data: { runOnThreads },
      });
    },
  );

/**
 * Saves the user's rules prompt and updates the rules accordingly.
 * Flow:
 * 1. Authenticate user and validate input
 * 2. Compare new prompt with old prompt (if exists)
 * 3. If prompts differ:
 *    a. For existing prompt: Identify added, edited, and removed rules
 *    b. For new prompt: Process all rules as additions
 * 4. Remove rules marked for deletion
 * 5. Edit existing rules that have changes
 * 6. Add new rules
 * 7. Update user's rules prompt in the database
 * 8. Return counts of created, edited, and removed rules
 */
export const saveRulesPromptAction = actionClient
  .metadata({ name: "saveRulesPrompt" })
  .inputSchema(saveRulesPromptBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { rulesPrompt },
    }) => {
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: {
          id: true,
          email: true,
          userId: true,
          about: true,
          multiRuleSelectionEnabled: true,
          rulesPrompt: true,
          categories: { select: { id: true, name: true } },
          user: {
            select: {
              aiProvider: true,
              aiModel: true,
              aiApiKey: true,
            },
          },
          account: {
            select: {
              provider: true,
            },
          },
        },
      });

      if (!emailAccount) {
        logger.error("Email account not found");
        throw new SafeError("Email account not found");
      }

      const oldPromptFile = emailAccount.rulesPrompt;
      logger.info("Old prompt file", {
        exists: oldPromptFile ? "exists" : "does not exist",
      });

      if (oldPromptFile === rulesPrompt) {
        logger.info("No changes in rules prompt, returning early");
        return { createdRules: 0, editedRules: 0, removedRules: 0 };
      }

      let addedRules: Awaited<ReturnType<typeof aiPromptToRules>> | null = null;
      let editRulesCount = 0;
      let removeRulesCount = 0;

      // check how the prompts have changed, and make changes to the rules accordingly
      if (oldPromptFile) {
        logger.info("Comparing old and new prompts");
        const diff = await aiDiffRules({
          emailAccount,
          oldPromptFile,
          newPromptFile: rulesPrompt,
        });

        logger.info("Diff results", {
          addedRules: diff.addedRules.length,
          editedRules: diff.editedRules.length,
          removedRules: diff.removedRules.length,
        });

        if (
          !diff.addedRules.length &&
          !diff.editedRules.length &&
          !diff.removedRules.length
        ) {
          logger.info("No changes detected in rules, returning early");
          return { createdRules: 0, editedRules: 0, removedRules: 0 };
        }

        if (diff.addedRules.length) {
          logger.info("Processing added rules");
          addedRules = await aiPromptToRulesOld({
            emailAccount,
            promptFile: diff.addedRules.join("\n\n"),
            isEditing: false,
          });
          logger.info("Added rules", {
            addedRules: addedRules?.length || 0,
          });
        }

        // find existing rules
        const userRules = await prisma.rule.findMany({
          where: { emailAccountId, enabled: true },
          include: { actions: true },
        });
        logger.info("Found existing user rules", {
          count: userRules.length,
        });

        const existingRules = await aiFindExistingRules({
          emailAccount,
          promptRulesToEdit: diff.editedRules,
          promptRulesToRemove: diff.removedRules,
          databaseRules: userRules,
        });

        // remove rules
        logger.info("Processing rules for removal", {
          count: existingRules.removedRules.length,
        });
        for (const rule of existingRules.removedRules) {
          if (!rule.rule) {
            logger.error("Rule not found.");
            continue;
          }

          const executedRule = await prisma.executedRule.findFirst({
            where: { emailAccountId, ruleId: rule.rule.id },
          });

          logger.info("Removing rule", {
            promptRule: rule.promptRule,
            ruleName: rule.rule.name,
            ruleId: rule.rule.id,
          });

          if (executedRule) {
            await prisma.rule.update({
              where: { id: rule.rule.id, emailAccountId },
              data: { enabled: false },
            });
          } else {
            try {
              await deleteRule({
                ruleId: rule.rule.id,
                emailAccountId,
                groupId: rule.rule.groupId,
              });
            } catch (error) {
              if (!isNotFoundError(error)) {
                logger.error("Error deleting rule", {
                  ruleId: rule.rule.id,
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                });
              }
            }
          }

          removeRulesCount++;
        }

        // edit rules
        if (existingRules.editedRules.length > 0) {
          const editedRules = await aiPromptToRulesOld({
            emailAccount,
            promptFile: existingRules.editedRules
              .map(
                (r) => `Rule ID: ${r.rule?.id}. Prompt: ${r.updatedPromptRule}`,
              )
              .join("\n\n"),
            isEditing: true,
          });

          for (const rule of editedRules) {
            if (!rule.ruleId) {
              logger.error("Rule ID not found for rule", {
                promptRule: rule.name,
              });
              continue;
            }

            logger.info("Editing rule", {
              promptRule: rule.name,
              ruleId: rule.ruleId,
            });

            editRulesCount++;

            await updateRule({
              ruleId: rule.ruleId,
              result: rule,
              emailAccountId,
              provider: emailAccount.account.provider,
              logger,
            });
          }
        }
      } else {
        logger.info("Processing new rules prompt with AI", { emailAccountId });
        addedRules = await aiPromptToRulesOld({
          emailAccount,
          promptFile: rulesPrompt,
          isEditing: false,
        });
        logger.info("Rules to be added", { count: addedRules?.length || 0 });
      }

      // add new rules
      for (const rule of addedRules || []) {
        logger.info("Creating rule", { ruleName: rule.name });

        try {
          await createRule({
            result: rule,
            emailAccountId,
            provider: emailAccount.account.provider,
            runOnThreads: true,
            logger,
          });
        } catch (error) {
          if (isDuplicateError(error, "name")) {
            logger.info("Skipping duplicate rule", { ruleName: rule.name });
          } else {
            logger.error("Failed to create rule", {
              ruleName: rule.name,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: { rulesPrompt },
      });

      logger.info("Completed", {
        createdRules: addedRules?.length || 0,
        editedRules: editRulesCount,
        removedRules: removeRulesCount,
      });

      return {
        createdRules: addedRules?.length || 0,
        editedRules: editRulesCount,
        removedRules: removeRulesCount,
      };
    },
  );

export const createRulesAction = actionClient
  .metadata({ name: "createRules" })
  .inputSchema(createRulesBody)
  .action(
    async ({ ctx: { emailAccountId, logger }, parsedInput: { prompt } }) => {
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: {
          id: true,
          email: true,
          userId: true,
          about: true,
          multiRuleSelectionEnabled: true,
          rulesPrompt: true,
          categories: { select: { id: true, name: true } },
          user: {
            select: {
              aiProvider: true,
              aiModel: true,
              aiApiKey: true,
            },
          },
          account: {
            select: {
              provider: true,
            },
          },
        },
      });

      if (!emailAccount) {
        logger.error("Email account not found");
        throw new SafeError("Email account not found");
      }

      const addedRules = await aiPromptToRules({
        emailAccount,
        promptFile: prompt,
      });

      logger.info("Rules to be added", { count: addedRules?.length || 0 });

      const createdRules: CreateRuleResult[] = [];
      const errors: { ruleName: string; error: string }[] = [];

      for (const rule of addedRules || []) {
        logger.info("Creating rule", { ruleName: rule.name });

        try {
          const createdRule = await createRule({
            result: rule,
            emailAccountId,
            provider: emailAccount.account.provider,
            runOnThreads: true,
            logger,
          });
          createdRules.push(createdRule);
        } catch (error) {
          if (isDuplicateError(error, "name")) {
            logger.info("Skipping duplicate rule", { ruleName: rule.name });
          } else {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            logger.error("Failed to create rule", {
              ruleName: rule.name,
              error: errorMessage,
            });
            errors.push({
              ruleName: rule.name,
              error: errorMessage,
            });
          }
        }
      }

      logger.info("Completed", {
        createdRules: createdRules.length,
        failedRules: errors.length,
      });

      return {
        rules: createdRules,
        errors: errors.length > 0 ? errors : undefined,
      };
    },
  );

/**
 * Generates a rules prompt based on the user's recent email activity and labels.
 * This function:
 * 1. Fetches the user's 20 most recent sent emails
 * 2. Retrieves the user's Gmail labels
 * 3. Calls an AI function to generate rule suggestions based on this data
 * 4. Returns the generated rules prompt as a string
 */
export const generateRulesPromptAction = actionClient
  .metadata({ name: "generateRulesPrompt" })
  .inputSchema(z.object({}))
  .action(async ({ ctx: { emailAccountId, provider } }) => {
    const emailAccount = await getEmailAccountWithAi({ emailAccountId });

    if (!emailAccount) throw new SafeError("Email account not found");

    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
    });
    const lastSentMessages = await emailProvider.getSentMessages(50);

    const labels = await emailProvider.getLabels();
    const labelsWithCounts = labels.map((label) => ({
      label: label.name,
      threadsTotal: label.threadsTotal || 1,
    }));

    const lastSentEmails = lastSentMessages.map((message) => {
      return emailToContent(message, { maxLength: 500 });
    });

    const snippetsResult = await aiFindSnippets({
      emailAccount,
      sentEmails: lastSentMessages.map((message) => ({
        id: message.id,
        from: message.headers.from,
        to: "",
        replyTo: message.headers["reply-to"],
        cc: message.headers.cc,
        subject: message.headers.subject,
        content: emailToContent(message),
      })),
    });

    const result = await aiGenerateRulesPrompt({
      emailAccount,
      lastSentEmails,
      snippets: snippetsResult.snippets.map((snippet) => snippet.text),
      userLabels: labelsWithCounts.map((label) => label.label),
    });

    if (!result) throw new SafeError("Error generating rules prompt");

    return { rulesPrompt: result.join("\n\n") };
  });
