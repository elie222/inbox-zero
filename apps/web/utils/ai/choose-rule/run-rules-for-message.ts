import prisma from "@/utils/prisma";
import {
  runRules,
  type RunRulesResult,
} from "@/utils/ai/choose-rule/run-rules";
import type { RunRulesBody } from "@/utils/actions/ai-rule.validation";
import { flushLoggerSafely } from "@/utils/logger-flush";
import { getEmailAccountForRuleExecution } from "@/utils/user/get";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import { checkHasAccess } from "@/utils/premium/server";
import {
  RERUN_MINIMUM_TIER,
  RERUN_UPGRADE_MESSAGE,
} from "@/utils/premium/rerun";
import type { Logger } from "@/utils/logger";
import { createFilingGuard } from "@/utils/mail-corrections/filing-eligibility";

export async function runRulesForMessage({
  emailAccountId,
  userId,
  provider,
  logger: ctxLogger,
  messageId,
  threadId,
  rerun,
  isTest,
  skipDraftReplies,
  requireInbox,
  requireReadUnflagged,
}: RunRulesBody & {
  emailAccountId: string;
  userId: string;
  provider: string;
  logger: Logger;
  requireInbox?: boolean;
  requireReadUnflagged?: boolean;
}): Promise<RunRulesResult[]> {
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
  const message = await emailProvider.getMessage(messageId).catch((error) => {
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

  if (requireInbox && !message.labelIds?.includes("INBOX")) return [];
  const beforeRuleExecution = requireReadUnflagged
    ? createFilingGuard(emailProvider, messageId)
    : undefined;
  await beforeRuleExecution?.();

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
    skipDraftReplies,
    beforeRuleExecution,
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
}

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
