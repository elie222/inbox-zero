"use server";

import { z } from "zod";
import prisma, { isNotFoundError } from "@/utils/prisma";
import { ExecutedRuleStatus } from "@prisma/client";
import { aiCreateRule } from "@/utils/ai/rule/create-rule";
import {
  runRules,
  type RunRulesResult,
} from "@/utils/ai/choose-rule/run-rules";
import { emailToContent, parseMessage } from "@/utils/mail";
import { getMessage, getMessages } from "@/utils/gmail/message";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import { isDefined } from "@/utils/types";
import { SafeError } from "@/utils/error";
import {
  createAutomationBody,
  reportAiMistakeBody,
  runRulesBody,
  testAiCustomContentBody,
} from "@/utils/actions/ai-rule.validation";
import { saveRulesPromptBody } from "@/utils/actions/rule.validation";
import { aiPromptToRules } from "@/utils/ai/rule/prompt-to-rules";
import { aiDiffRules } from "@/utils/ai/rule/diff-rules";
import { aiFindExistingRules } from "@/utils/ai/rule/find-existing-rules";
import { aiGenerateRulesPrompt } from "@/utils/ai/rule/generate-rules-prompt";
import { getLabelById, getLabels } from "@/utils/gmail/label";
import { createScopedLogger } from "@/utils/logger";
import { aiFindSnippets } from "@/utils/ai/snippets/find-snippets";
import { aiRuleFix } from "@/utils/ai/rule/rule-fix";
import { labelVisibility } from "@/utils/gmail/constants";
import type { CreateOrUpdateRuleSchemaWithCategories } from "@/utils/ai/rule/create-rule-schema";
import { deleteRule, safeCreateRule, safeUpdateRule } from "@/utils/rule/rule";
import { getUserCategoriesForNames } from "@/utils/category.server";
import { actionClient } from "@/utils/actions/safe-action";
import { getGmailClientForEmail } from "@/utils/account";

const logger = createScopedLogger("ai-rule");

export const runRulesAction = actionClient
  .metadata({ name: "runRules" })
  .schema(runRulesBody)
  .action(
    async ({
      ctx: { email, emailAccount },
      parsedInput: { messageId, threadId, rerun, isTest },
    }): Promise<RunRulesResult> => {
      const gmail = await getGmailClientForEmail({ email });

      if (!emailAccount) throw new SafeError("Email account not found");

      const fetchExecutedRule = !isTest && !rerun;

      const [gmailMessage, executedRule] = await Promise.all([
        getMessage(messageId, gmail, "full"),
        fetchExecutedRule
          ? prisma.executedRule.findUnique({
              where: {
                unique_emailAccount_thread_message: {
                  emailAccountId: emailAccount.email,
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
          : null,
      ]);

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

      const message = parseMessage(gmailMessage);

      const rules = await prisma.rule.findMany({
        where: {
          emailAccountId: email,
          enabled: true,
          instructions: { not: null },
        },
        include: { actions: true, categoryFilters: true },
      });

      const result = await runRules({
        isTest,
        gmail,
        message,
        rules,
        user: emailAccount,
      });

      return result;
    },
  );

export const testAiCustomContentAction = actionClient
  .metadata({ name: "testAiCustomContent" })
  .schema(testAiCustomContentBody)
  .action(
    async ({ ctx: { email, emailAccount }, parsedInput: { content } }) => {
      if (!emailAccount) throw new SafeError("Email account not found");

      const gmail = await getGmailClientForEmail({ email });

      const rules = await prisma.rule.findMany({
        where: {
          emailAccountId: email,
          enabled: true,
          instructions: { not: null },
        },
        include: { actions: true, categoryFilters: true },
      });

      const result = await runRules({
        isTest: true,
        gmail,
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
        user: emailAccount,
      });

      return result;
    },
  );

export const createAutomationAction = actionClient
  .metadata({ name: "createAutomation" })
  .schema(createAutomationBody)
  .action(async ({ ctx: { email, emailAccount }, parsedInput: { prompt } }) => {
    if (!emailAccount) throw new SafeError("Email account not found");

    let result: CreateOrUpdateRuleSchemaWithCategories;

    try {
      result = await aiCreateRule(prompt, emailAccount);
    } catch (error) {
      if (error instanceof Error) {
        throw new SafeError(`AI error creating rule. ${error.message}`);
      }
      throw new SafeError("AI error creating rule.");
    }

    if (!result) throw new SafeError("AI error creating rule.");

    const createdRule = await safeCreateRule({ result, email });
    return createdRule;
  });

export const setRuleRunOnThreadsAction = actionClient
  .metadata({ name: "setRuleRunOnThreads" })
  .schema(z.object({ ruleId: z.string(), runOnThreads: z.boolean() }))
  .action(async ({ ctx: { email }, parsedInput: { ruleId, runOnThreads } }) => {
    await prisma.rule.update({
      where: { id: ruleId, emailAccountId: email },
      data: { runOnThreads },
    });
  });

export const approvePlanAction = actionClient
  .metadata({ name: "approvePlan" })
  .schema(z.object({ executedRuleId: z.string(), message: z.any() }))
  .action(
    async ({ ctx: { email }, parsedInput: { executedRuleId, message } }) => {
      const gmail = await getGmailClientForEmail({ email });

      const executedRule = await prisma.executedRule.findUnique({
        where: { id: executedRuleId },
        include: { actionItems: true },
      });
      if (!executedRule) return { error: "Item not found" };

      await executeAct({
        gmail,
        message,
        executedRule,
        userEmail: email,
      });
    },
  );

export const rejectPlanAction = actionClient
  .metadata({ name: "rejectPlan" })
  .schema(z.object({ executedRuleId: z.string() }))
  .action(async ({ ctx: { email }, parsedInput: { executedRuleId } }) => {
    await prisma.executedRule.updateMany({
      where: { id: executedRuleId, emailAccountId: email },
      data: { status: ExecutedRuleStatus.REJECTED },
    });
  });

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
  .action(async ({ ctx: { email }, parsedInput: { rulesPrompt } }) => {
    logger.info("Starting saveRulesPromptAction", { email });

    const emailAccount = await prisma.emailAccount.findUnique({
      where: { email },
      select: {
        rulesPrompt: true,
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
        email: true,
        userId: true,
        about: true,
        categories: { select: { id: true, name: true } },
      },
    });

    if (!emailAccount) {
      logger.error("Email account not found");
      return { error: "Email account not found" };
    }

    const oldPromptFile = emailAccount.rulesPrompt;
    logger.info("Old prompt file", {
      email,
      exists: oldPromptFile ? "exists" : "does not exist",
    });

    if (oldPromptFile === rulesPrompt) {
      logger.info("No changes in rules prompt, returning early", { email });
      return { createdRules: 0, editedRules: 0, removedRules: 0 };
    }

    let addedRules: Awaited<ReturnType<typeof aiPromptToRules>> | null = null;
    let editRulesCount = 0;
    let removeRulesCount = 0;

    // check how the prompts have changed, and make changes to the rules accordingly
    if (oldPromptFile) {
      logger.info("Comparing old and new prompts", { email });
      const diff = await aiDiffRules({
        user: emailAccount,
        oldPromptFile,
        newPromptFile: rulesPrompt,
      });

      logger.info("Diff results", {
        email,
        addedRules: diff.addedRules.length,
        editedRules: diff.editedRules.length,
        removedRules: diff.removedRules.length,
      });

      if (
        !diff.addedRules.length &&
        !diff.editedRules.length &&
        !diff.removedRules.length
      ) {
        logger.info("No changes detected in rules, returning early", { email });
        return { createdRules: 0, editedRules: 0, removedRules: 0 };
      }

      if (diff.addedRules.length) {
        logger.info("Processing added rules", { email });
        addedRules = await aiPromptToRules({
          user: emailAccount,
          promptFile: diff.addedRules.join("\n\n"),
          isEditing: false,
          availableCategories: emailAccount.categories.map((c) => c.name),
        });
        logger.info("Added rules", {
          email,
          addedRules: addedRules?.length || 0,
        });
      }

      // find existing rules
      const userRules = await prisma.rule.findMany({
        where: { emailAccountId: email, enabled: true },
        include: { actions: true },
      });
      logger.info("Found existing user rules", {
        email,
        count: userRules.length,
      });

      const existingRules = await aiFindExistingRules({
        user: emailAccount,
        promptRulesToEdit: diff.editedRules,
        promptRulesToRemove: diff.removedRules,
        databaseRules: userRules,
      });

      // remove rules
      logger.info("Processing rules for removal", {
        email,
        count: existingRules.removedRules.length,
      });
      for (const rule of existingRules.removedRules) {
        if (!rule.rule) {
          logger.error("Rule not found.", { email });
          continue;
        }

        const executedRule = await prisma.executedRule.findFirst({
          where: { emailAccountId: email, ruleId: rule.rule.id },
        });

        logger.info("Removing rule", {
          email,
          promptRule: rule.promptRule,
          ruleName: rule.rule.name,
          ruleId: rule.rule.id,
        });

        if (executedRule) {
          await prisma.rule.update({
            where: { id: rule.rule.id, emailAccountId: email },
            data: { enabled: false },
          });
        } else {
          try {
            await deleteRule({
              ruleId: rule.rule.id,
              email,
              groupId: rule.rule.groupId,
            });
          } catch (error) {
            if (!isNotFoundError(error)) {
              logger.error("Error deleting rule", {
                email,
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
          user: emailAccount,
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
              email,
              promptRule: rule.name,
            });
            continue;
          }

          logger.info("Editing rule", {
            email,
            promptRule: rule.name,
            ruleId: rule.ruleId,
          });

          const categoryIds = await getUserCategoriesForNames({
            email,
            names: rule.condition.categories?.categoryFilters || [],
          });

          editRulesCount++;

          await safeUpdateRule({
            ruleId: rule.ruleId,
            result: rule,
            email,
            categoryIds,
          });
        }
      }
    } else {
      logger.info("Processing new rules prompt with AI", { email });
      addedRules = await aiPromptToRules({
        user: emailAccount,
        promptFile: rulesPrompt,
        isEditing: false,
        availableCategories: emailAccount.categories.map((c) => c.name),
      });
      logger.info("Rules to be added", {
        email,
        count: addedRules?.length || 0,
      });
    }

    // add new rules
    for (const rule of addedRules || []) {
      logger.info("Creating rule", {
        email,
        promptRule: rule.name,
        ruleId: rule.ruleId,
      });

      await safeCreateRule({
        result: rule,
        email,
        categoryNames: rule.condition.categories?.categoryFilters || [],
      });
    }

    // update rules prompt for user
    await prisma.emailAccount.update({
      where: { email },
      data: { rulesPrompt },
    });

    logger.info("Completed", {
      email,
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
  .action(async ({ ctx: { email, emailAccount } }) => {
    if (!emailAccount) throw new SafeError("Email account not found");

    const gmail = await getGmailClientForEmail({ email });
    const lastSent = await getMessages(gmail, {
      query: "in:sent",
      maxResults: 50,
    });
    const gmailLabels = await getLabels(gmail);
    const userLabels = gmailLabels?.filter((label) => label.type === "user");

    const labelsWithCounts: { label: string; threadsTotal: number }[] = [];

    for (const label of userLabels || []) {
      if (!label.id) continue;
      if (label.labelListVisibility === labelVisibility.labelHide) continue;
      const labelById = await getLabelById({ gmail, id: label.id });
      if (!labelById?.name) continue;
      if (!labelById.threadsTotal) continue; // Skip labels with 0 threads
      labelsWithCounts.push({
        label: labelById.name,
        threadsTotal: labelById.threadsTotal || 0,
      });
    }

    const lastSentMessages = (
      await Promise.all(
        lastSent.messages?.map(async (message) => {
          if (!message.id) return null;
          const gmailMessage = await getMessage(message.id, gmail);
          return parseMessage(gmailMessage);
        }) || [],
      )
    ).filter(isDefined);
    const lastSentEmails = lastSentMessages?.map((message) => {
      return emailToContent(message, { maxLength: 500 });
    });

    const snippetsResult = await aiFindSnippets({
      user: emailAccount,
      sentEmails: lastSentMessages.map((message) => ({
        id: message.id,
        from: message.headers.from,
        replyTo: message.headers["reply-to"],
        cc: message.headers.cc,
        subject: message.headers.subject,
        content: emailToContent(message),
      })),
    });

    const result = await aiGenerateRulesPrompt({
      user: emailAccount,
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
  .action(async ({ ctx: { email }, parsedInput: { ruleId, enabled } }) => {
    await prisma.rule.update({
      where: { id: ruleId, emailAccountId: email },
      data: { enabled },
    });
  });

export const reportAiMistakeAction = actionClient
  .metadata({ name: "reportAiMistake" })
  .schema(reportAiMistakeBody)
  .action(
    async ({
      ctx: { email, emailAccount },
      parsedInput: { expectedRuleId, actualRuleId, explanation, message },
    }) => {
      if (!emailAccount) throw new SafeError("Email account not found");

      if (!expectedRuleId && !actualRuleId)
        throw new SafeError("Either correct or incorrect rule ID is required");

      const [expectedRule, actualRule] = await Promise.all([
        expectedRuleId
          ? prisma.rule.findUnique({
              where: { id: expectedRuleId, emailAccountId: email },
            })
          : null,
        actualRuleId
          ? prisma.rule.findUnique({
              where: { id: actualRuleId, emailAccountId: email },
            })
          : null,
      ]);

      if (expectedRuleId && !expectedRule)
        throw new SafeError("Expected rule not found");

      if (actualRuleId && !actualRule)
        throw new SafeError("Actual rule not found");

      const content = emailToContent({
        textHtml: message.textHtml || undefined,
        textPlain: message.textPlain || undefined,
        snippet: message.snippet || "",
      });

      const result = await aiRuleFix({
        user: emailAccount,
        actualRule,
        expectedRule,
        email: {
          id: "",
          ...message,
          content,
        },
        explanation: explanation?.trim() || undefined,
      });

      if (!result) throw new SafeError("Error fixing rule");

      return {
        ruleId:
          result.ruleToFix === "actual_rule" ? actualRuleId : expectedRuleId,
        fixedInstructions: result.fixedInstructions,
      };
    },
  );
