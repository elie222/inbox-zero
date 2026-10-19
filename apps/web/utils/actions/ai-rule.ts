"use server";

import { z } from "zod";
import prisma from "@/utils/prisma";
import {
  runRules,
  type RunRulesResult,
} from "@/utils/ai/choose-rule/run-rules";
import { runRulesOnMessage } from "@/utils/ai/choose-rule/run-rules-on-message";
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
import { checkHasAccess } from "@/utils/premium/server";
import {
  RERUN_MINIMUM_TIER,
  RERUN_UPGRADE_MESSAGE,
} from "@/utils/premium/rerun";

export const runRulesAction = actionClient
  .metadata({ name: "runRules" })
  .inputSchema(runRulesBody)
  .action(
    async ({
      ctx: { emailAccountId, userId, provider, logger: ctxLogger },
      parsedInput: { messageId, threadId, rerun, isTest, skipDraftReplies },
    }): Promise<RunRulesResult[]> => {
      const logger = ctxLogger.with({ messageId, threadId });

      logger.info("runRulesAction started", { isTest, rerun });

      // Re-running discards the existing result and pays for a fresh LLM call,
      // so it's limited to the top tier.
      if (rerun && !isTest) {
        const hasAccess = await checkHasAccess({
          userId,
          minimumTier: RERUN_MINIMUM_TIER,
        });
        if (!hasAccess) {
          logger.warn("Blocked rerun without Professional access");
          throw new SafeError(RERUN_UPGRADE_MESSAGE);
        }
      }

      const result = await runRulesOnMessage({
        emailAccountId,
        provider,
        messageId,
        threadId,
        rerun,
        isTest,
        skipDraftReplies,
        logger,
        onStageError: ({ error, stage }) =>
          flushAndRethrowRunRulesActionError({
            logger,
            error,
            isTest,
            stage,
          }),
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
