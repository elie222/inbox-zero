"use server";

import { z } from "zod";
import prisma, { isNotFoundError } from "@/utils/prisma";
import { ExecutedRuleStatus } from "@prisma/client";
import { aiCreateRule } from "@/utils/ai/rule/create-rule";
import {
  runRules,
  type RunRulesResult,
} from "@/utils/ai/choose-rule/run-rules";
import { emailToContent } from "@/utils/mail";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import {
  createAutomationBody,
  runRulesBody,
  testAiCustomContentBody,
} from "@/utils/actions/ai-rule.validation";
import { saveRulesPromptBody } from "@/utils/actions/rule.validation";
import { aiPromptToRules } from "@/utils/ai/rule/prompt-to-rules";
import { aiDiffRules } from "@/utils/ai/rule/diff-rules";
import { aiFindExistingRules } from "@/utils/ai/rule/find-existing-rules";
import { aiGenerateRulesPrompt } from "@/utils/ai/rule/generate-rules-prompt";
import { createScopedLogger } from "@/utils/logger";
import { aiFindSnippets } from "@/utils/ai/snippets/find-snippets";
import type { CreateOrUpdateRuleSchemaWithCategories } from "@/utils/ai/rule/create-rule-schema";
import { deleteRule, safeCreateRule, safeUpdateRule } from "@/utils/rule/rule";
import { getUserCategoriesForNames } from "@/utils/category.server";
import { actionClient } from "@/utils/actions/safe-action";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";

const logger = createScopedLogger("ai-rule");

export const runRulesAction = actionClient
  .metadata({ name: "runRules" })
  .schema(runRulesBody)
  .action(
    async ({
      ctx: { emailAccountId, provider },
      parsedInput: { messageId, threadId, rerun, isTest },
    }): Promise<RunRulesResult> => {
      const emailAccount = await getEmailAccountWithAi({ emailAccountId });

      if (!emailAccount) throw new Error("Email account not found");
      if (!provider) throw new Error("Provider not found");

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
      });
      const message = await emailProvider.getMessage(messageId);

      const fetchExecutedRule = !isTest && !rerun;

      const executedRule = fetchExecutedRule
        ? await prisma.executedRule.findUnique({
            where: {
              unique_emailAccount_thread_message: {
                emailAccountId,
                threadId,
                messageId,
              },
            },
            select: {
              id: true,
              reason: true,
              actionItems: true,
              rule: true,
            },
          })
        : null;

      if (executedRule) {
        logger.info("Skipping. Rule already exists.", {
          email: emailAccount.email,
          messageId,
          threadId,
        });

        return {
          rule: executedRule.rule,
          actionItems: executedRule.actionItems,
          reason: executedRule.reason,
          existing: true,
        };
      }

      const rules = await prisma.rule.findMany({
        where: {
          emailAccountId,
          enabled: true,
        },
        include: { actions: true, categoryFilters: true },
      });

      console.log("TEST LOG 2");
      const result = await runRules({
        isTest,
        client: emailProvider,
        message,
        rules,
        emailAccount,
      });

      return result;
    },
  );

export const testAiCustomContentAction = actionClient
  .metadata({ name: "testAiCustomContent" })
  .schema(testAiCustomContentBody)
  .action(
    async ({ ctx: { emailAccountId, provider }, parsedInput: { content } }) => {
      const emailAccount = await getEmailAccountWithAi({ emailAccountId });

      if (!emailAccount) throw new SafeError("Email account not found");

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
      });

      const rules = await prisma.rule.findMany({
        where: {
          emailAccountId,
          enabled: true,
          instructions: { not: null },
        },
        include: { actions: true, categoryFilters: true },
      });

      console.log("TEST LOG 3");
      const result = await runRules({
        isTest: true,
        client: emailProvider,
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
        },
        rules,
        emailAccount,
      });

      return result;
    },
  );

export const createAutomationAction = actionClient
  .metadata({ name: "createAutomation" })
  .schema(createAutomationBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { prompt } }) => {
    const emailAccount = await getEmailAccountWithAi({ emailAccountId });

    if (!emailAccount) throw new Error("Email account not found");

    let result: CreateOrUpdateRuleSchemaWithCategories;

    try {
      result = await aiCreateRule(prompt, emailAccount);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`AI error creating rule. ${error.message}`);
      }
      throw new Error("AI error creating rule.");
    }

    if (!result) throw new Error("AI error creating rule.");

    const createdRule = await safeCreateRule({
      result,
      emailAccountId,
    });
    return createdRule;
  });

export const setRuleRunOnThreadsAction = actionClient
  .metadata({ name: "setRuleRunOnThreads" })
  .schema(z.object({ ruleId: z.string(), runOnThreads: z.boolean() }))
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

export const approvePlanAction = actionClient
  .metadata({ name: "approvePlan" })
  .schema(z.object({ executedRuleId: z.string(), message: z.any() }))
  .action(
    async ({
      ctx: { emailAccountId, emailAccount, provider },
      parsedInput: { executedRuleId, message },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
      });

      const executedRule = await prisma.executedRule.findUnique({
        where: { id: executedRuleId },
        include: { actionItems: true },
      });
      if (!executedRule) throw new SafeError("Plan not found");

      await executeAct({
        client: emailProvider,
        message,
        executedRule,
        userEmail: emailAccount.email,
        userId: emailAccount.userId,
        emailAccountId,
      });
    },
  );

export const rejectPlanAction = actionClient
  .metadata({ name: "rejectPlan" })
  .schema(z.object({ executedRuleId: z.string() }))
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { executedRuleId } }) => {
      await prisma.executedRule.updateMany({
        where: { id: executedRuleId, emailAccountId },
        data: { status: ExecutedRuleStatus.REJECTED },
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
  .schema(saveRulesPromptBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { rulesPrompt } }) => {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        id: true,
        email: true,
        userId: true,
        about: true,
        rulesPrompt: true,
        categories: { select: { id: true, name: true } },
        user: {
          select: {
            aiProvider: true,
            aiModel: true,
            aiApiKey: true,
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
      emailAccountId,
      exists: oldPromptFile ? "exists" : "does not exist",
    });

    if (oldPromptFile === rulesPrompt) {
      logger.info("No changes in rules prompt, returning early", {
        emailAccountId,
      });
      return { createdRules: 0, editedRules: 0, removedRules: 0 };
    }

    let addedRules: Awaited<ReturnType<typeof aiPromptToRules>> | null = null;
    let editRulesCount = 0;
    let removeRulesCount = 0;

    // check how the prompts have changed, and make changes to the rules accordingly
    if (oldPromptFile) {
      logger.info("Comparing old and new prompts", { emailAccountId });
      const diff = await aiDiffRules({
        emailAccount,
        oldPromptFile,
        newPromptFile: rulesPrompt,
      });

      logger.info("Diff results", {
        emailAccountId,
        addedRules: diff.addedRules.length,
        editedRules: diff.editedRules.length,
        removedRules: diff.removedRules.length,
      });

      if (
        !diff.addedRules.length &&
        !diff.editedRules.length &&
        !diff.removedRules.length
      ) {
        logger.info("No changes detected in rules, returning early", {
          emailAccountId,
        });
        return { createdRules: 0, editedRules: 0, removedRules: 0 };
      }

      if (diff.addedRules.length) {
        logger.info("Processing added rules", { emailAccountId });
        addedRules = await aiPromptToRules({
          emailAccount,
          promptFile: diff.addedRules.join("\n\n"),
          isEditing: false,
          availableCategories: emailAccount.categories.map((c) => c.name),
        });
        logger.info("Added rules", {
          emailAccountId,
          addedRules: addedRules?.length || 0,
        });
      }

      // find existing rules
      const userRules = await prisma.rule.findMany({
        where: { emailAccountId, enabled: true },
        include: { actions: true },
      });
      logger.info("Found existing user rules", {
        emailAccountId,
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
        emailAccountId,
        count: existingRules.removedRules.length,
      });
      for (const rule of existingRules.removedRules) {
        if (!rule.rule) {
          logger.error("Rule not found.", { emailAccountId });
          continue;
        }

        const executedRule = await prisma.executedRule.findFirst({
          where: { emailAccountId, ruleId: rule.rule.id },
        });

        logger.info("Removing rule", {
          emailAccountId,
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
                emailAccountId,
                ruleId: rule.rule.id,
                error: error instanceof Error ? error.message : "Unknown error",
              });
            }
          }
        }

        removeRulesCount++;
      }

      // edit rules
      if (existingRules.editedRules.length > 0) {
        const editedRules = await aiPromptToRules({
          emailAccount,
          promptFile: existingRules.editedRules
            .map(
              (r) => `Rule ID: ${r.rule?.id}. Prompt: ${r.updatedPromptRule}`,
            )
            .join("\n\n"),
          isEditing: true,
          availableCategories: emailAccount.categories.map((c) => c.name),
        });

        for (const rule of editedRules) {
          if (!rule.ruleId) {
            logger.error("Rule ID not found for rule", {
              emailAccountId,
              promptRule: rule.name,
            });
            continue;
          }

          logger.info("Editing rule", {
            emailAccountId,
            promptRule: rule.name,
            ruleId: rule.ruleId,
          });

          const categoryIds = await getUserCategoriesForNames({
            emailAccountId,
            names: rule.condition.categories?.categoryFilters || [],
          });

          editRulesCount++;

          await safeUpdateRule({
            ruleId: rule.ruleId,
            result: rule,
            emailAccountId,
            categoryIds,
          });
        }
      }
    } else {
      logger.info("Processing new rules prompt with AI", { emailAccountId });
      addedRules = await aiPromptToRules({
        emailAccount,
        promptFile: rulesPrompt,
        isEditing: false,
        availableCategories: emailAccount.categories.map((c) => c.name),
      });
      logger.info("Rules to be added", {
        emailAccountId,
        count: addedRules?.length || 0,
      });
    }

    // add new rules
    for (const rule of addedRules || []) {
      logger.info("Creating rule", {
        emailAccountId,
        promptRule: rule.name,
        ruleId: rule.ruleId,
      });

      await safeCreateRule({
        result: rule,
        emailAccountId,
        categoryNames: rule.condition.categories?.categoryFilters || [],
      });
    }

    // update rules prompt for user
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { rulesPrompt },
    });

    logger.info("Completed", {
      emailAccountId,
      createdRules: addedRules?.length || 0,
      editedRules: editRulesCount,
      removedRules: removeRulesCount,
    });

    return {
      createdRules: addedRules?.length || 0,
      editedRules: editRulesCount,
      removedRules: removeRulesCount,
    };
  });

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
  .schema(z.object({}))
  .action(async ({ ctx: { emailAccountId, provider } }) => {
    const emailAccount = await getEmailAccountWithAi({ emailAccountId });

    if (!emailAccount) throw new SafeError("Email account not found");

    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
    });
    const lastSentMessages = await emailProvider.getMessages("in:sent", 50);

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

export const setRuleEnabledAction = actionClient
  .metadata({ name: "setRuleEnabled" })
  .schema(z.object({ ruleId: z.string(), enabled: z.boolean() }))
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { ruleId, enabled } }) => {
      await prisma.rule.update({
        where: { id: ruleId, emailAccountId },
        data: { enabled },
      });
    },
  );
