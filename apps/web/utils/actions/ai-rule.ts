"use server";

import { z } from "zod";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import {
  runRules,
  type RunRulesResult,
} from "@/utils/ai/choose-rule/run-rules";
import {
  runRulesBody,
  testAiCustomContentBody,
} from "@/utils/actions/ai-rule.validation";
import { createRulesBody } from "@/utils/actions/rule.validation";
import { aiPromptToRules } from "@/utils/ai/rule/prompt-to-rules";
import { createRule, setRuleRunOnThreads } from "@/utils/rule/rule";
import { actionClient } from "@/utils/actions/safe-action";
import { flushLoggerSafely } from "@/utils/logger-flush";
import { getEmailAccountForRuleExecution } from "@/utils/user/get";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import type { RuleWithRelations } from "@/utils/rule/types";

export const runRulesAction = actionClient
  .metadata({ name: "runRules" })
  .inputSchema(runRulesBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger: ctxLogger },
      parsedInput: { messageId, threadId, rerun, isTest },
    }): Promise<RunRulesResult[]> => {
      const logger = ctxLogger.with({ messageId, threadId });

      logger.info("runRulesAction started", { isTest, rerun });

      logger.info("Loading email account for rule execution");
      const emailAccount = await getEmailAccountForRuleExecution({
        emailAccountId,
      }).catch((error) => {
        logger.error("Failed to load email account for rule execution", {
          error,
        });
        throw error;
      });
      logger.info("Loaded email account for rule execution", {
        emailAccountFound: Boolean(emailAccount),
      });

      if (!emailAccount) throw new SafeError("Email account not found");
      if (!provider) throw new SafeError("Provider not found");

      logger.info("Creating email provider");
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      }).catch((error) => {
        logger.error("Failed to create email provider", { error });
        throw error;
      });
      logger.info("Created email provider");

      logger.info("Fetching message for rule execution");
      const message = await emailProvider
        .getMessage(messageId)
        .catch((error) => {
          logger.error("Failed to fetch message for rule execution", { error });
          throw error;
        });
      logger.info("Fetched message for rule execution", {
        fetchedThreadId: message.threadId,
      });

      const fetchExecutedRule = !isTest && !rerun;

      logger.info("Loading existing executed rules", { fetchExecutedRule });
      const executedRules = await (fetchExecutedRule
        ? prisma.executedRule.findMany({
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
        : Promise.resolve([])
      ).catch((error) => {
        logger.error("Failed to load existing executed rules", { error });
        throw error;
      });
      logger.info("Loaded existing executed rules", {
        executedRuleCount: executedRules.length,
      });

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

      logger.info("Loading enabled rules for execution");
      const rules = await prisma.rule
        .findMany({
          where: {
            emailAccountId,
            enabled: true,
          },
          include: {
            actions: true,
          },
        })
        .catch((error) => {
          logger.error("Failed to load enabled rules for execution", { error });
          throw error;
        });
      logger.info("Loaded enabled rules for execution", {
        ruleCount: rules.length,
      });

      logger.info("Invoking runRules");
      const result = await runRules({
        isTest,
        provider: emailProvider,
        message,
        rules,
        emailAccount,
        logger,
        modelType: "chat",
      }).catch((error) => {
        logger.error("runRules failed", { error });
        throw error;
      });

      logger.info("runRules completed", {
        resultCount: result.length,
        matchedCount: result.filter((item) => !!item.rule).length,
        skippedCount: result.filter((item) => !item.rule).length,
      });

      if (isTest) {
        await flushLoggerSafely(logger, {
          action: "runRules",
          flushReason: "test-mode",
        });
      }

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
      const emailAccount = await getEmailAccountForRuleExecution({
        emailAccountId,
      });

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
        include: {
          actions: true,
        },
      });

      const testId = `testMessageId-${Date.now()}`;

      const result = await runRules({
        isTest: true,
        provider: emailProvider,
        logger,
        message: {
          id: testId,
          // Match id so Gmail's isReplyInThread (which compares id !== threadId)
          // treats this synthetic test message as the first message in a thread.
          threadId: testId,
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

      logger.info("testAiCustomContent completed", {
        resultCount: result.length,
        matchedCount: result.filter((item) => !!item.rule).length,
        skippedCount: result.filter((item) => !item.rule).length,
      });

      await flushLoggerSafely(logger, {
        action: "testAiCustomContent",
        flushReason: "test-mode",
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
      await setRuleRunOnThreads({ ruleId, emailAccountId, runOnThreads });
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
          timezone: true,
          calendarBookingLink: true,
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

      const createdRules: RuleWithRelations[] = [];
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
              error,
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
