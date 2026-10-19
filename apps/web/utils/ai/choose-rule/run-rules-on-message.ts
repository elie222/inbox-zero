import prisma from "@/utils/prisma";
import {
  runRules,
  type RunRulesResult,
} from "@/utils/ai/choose-rule/run-rules";
import { getEmailAccountForRuleExecution } from "@/utils/user/get";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";

type StageErrorHandler = (args: {
  error: unknown;
  stage: string;
}) => Promise<never>;

/**
 * Loads the account, provider, message and rules, then runs the rules on one
 * message. Shared by the Assistant page's Test/Run action and the chat tool so
 * both stay in sync on existing-result handling and rule loading.
 */
export async function runRulesOnMessage({
  emailAccountId,
  provider,
  messageId,
  threadId,
  rerun,
  isTest,
  skipDraftReplies,
  logger,
  onStageError,
}: {
  emailAccountId: string;
  provider: string | null | undefined;
  messageId: string;
  threadId?: string;
  rerun?: boolean | null;
  isTest: boolean;
  skipDraftReplies?: boolean;
  logger: Logger;
  onStageError?: StageErrorHandler;
}): Promise<RunRulesResult[]> {
  const failAt = async (stage: string, error: unknown): Promise<never> => {
    if (onStageError) return onStageError({ error, stage });
    throw error;
  };

  logger.info("Loading email account for rule execution");
  const emailAccount = await getEmailAccountForRuleExecution({
    emailAccountId,
  }).catch((error) => {
    logger.error("Failed to load email account for rule execution", { error });
    return failAt("load-email-account", error);
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
    return failAt("create-email-provider", error);
  });
  logger.info("Created email provider");

  logger.info("Fetching message for rule execution");
  const message = await emailProvider.getMessage(messageId).catch((error) => {
    logger.warn("Failed to fetch message for rule execution", { error });
    return failAt("fetch-message", error);
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
          threadId: threadId ?? message.threadId,
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
    return failAt("load-existing-executed-rules", error);
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
      return failAt("load-enabled-rules", error);
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
  }).catch((error) => {
    logger.error("runRules failed", { error });
    return failAt("run-rules", error);
  });

  logger.info("runRules completed", {
    resultCount: result.length,
    matchedCount: result.filter((item) => !!item.rule).length,
    skippedCount: result.filter((item) => !item.rule).length,
  });

  return result;
}
