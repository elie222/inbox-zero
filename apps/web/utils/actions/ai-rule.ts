"use server";

import { z } from "zod";
import prisma from "@/utils/prisma";
import {
  runRules,
  type RunRulesResult,
} from "@/utils/ai/choose-rule/run-rules";
import {
  runRulesBody,
  testAiCustomContentBody,
} from "@/utils/actions/ai-rule.validation";
import { setRuleRunOnThreads } from "@/utils/rule/rule";
import { assertRuleIsNotOrgManaged } from "@/utils/organizations/rules";
import { actionClient } from "@/utils/actions/safe-action";
import { flushLoggerSafely } from "@/utils/logger-flush";
import { getEmailAccountForRuleExecution } from "@/utils/user/get";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";

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
        return flushAndRethrowRunRulesActionError({
          logger,
          error,
          isTest,
          stage: "load-email-account",
        });
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
        logger.warn("Failed to create email provider", { error });
        return flushAndRethrowRunRulesActionError({
          logger,
          error,
          isTest,
          stage: "create-email-provider",
        });
      });
      logger.info("Created email provider");

      logger.info("Fetching message for rule execution");
      const message = await emailProvider
        .getMessage(messageId)
        .catch((error) => {
          logger.warn("Failed to fetch message for rule execution", { error });
          return flushAndRethrowRunRulesActionError({
            logger,
            error,
            isTest,
            stage: "fetch-message",
          });
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
        return flushAndRethrowRunRulesActionError({
          logger,
          error,
          isTest,
          stage: "load-existing-executed-rules",
        });
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
          return flushAndRethrowRunRulesActionError({
            logger,
            error,
            isTest,
            stage: "load-enabled-rules",
          });
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
        return flushAndRethrowRunRulesActionError({
          logger,
          error,
          isTest,
          stage: "run-rules",
        });
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
      try {
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
      } catch (error) {
        logger.warn("testAiCustomContent failed", { error });
        await flushLoggerSafely(logger, {
          action: "testAiCustomContent",
          flushReason: "test-mode-error",
        });
        throw error;
      }
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
      await assertRuleIsNotOrgManaged({ ruleId, emailAccountId });
      await setRuleRunOnThreads({ ruleId, emailAccountId, runOnThreads });
    },
  );

type FlushableLogger = Parameters<typeof flushLoggerSafely>[0];

async function flushAndRethrowRunRulesActionError({
  logger,
  error,
  isTest,
  stage,
}: {
  logger: FlushableLogger;
  error: unknown;
  isTest?: boolean;
  stage: string;
}): Promise<never> {
  if (isTest) {
    await flushLoggerSafely(logger, {
      action: "runRules",
      flushReason: "test-mode-error",
      stage,
    });
  }

  throw error;
}
