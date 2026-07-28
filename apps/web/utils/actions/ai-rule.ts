"use server";

import { z } from "zod";
import prisma from "@/utils/prisma";
import {
  runRules,
  type RunRulesResult,
} from "@/utils/ai/choose-rule/run-rules";
import {
  bulkProcessThreadsBody,
  finalizeReprocessBody,
  runRulesBody,
  testAiCustomContentBody,
} from "@/utils/actions/ai-rule.validation";
import { runWithBoundedConcurrency } from "@/utils/async";
import { setRuleRunOnThreads } from "@/utils/rule/rule";
import { assertRuleIsNotOrgManaged } from "@/utils/organizations/rules";
import { ActionType, ExecutedRuleStatus } from "@/generated/prisma/enums";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { actionClient } from "@/utils/actions/safe-action";
import { flushLoggerSafely } from "@/utils/logger-flush";
import { getEmailAccountForRuleExecution } from "@/utils/user/get";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import { suppressLabelLearning } from "@/utils/redis/label-learning-suppression";
import { recordReprocessLearning } from "@/utils/rule/reprocess-learning";
import { findLabelByName } from "@/utils/label/find-label-by-name";
import { normalizeLabelName } from "@/utils/label/normalize-label-name";
import { extractEmailAddress } from "@/utils/email";

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

      // A stored decision whose rule has since been disabled isn't the
      // answer anymore — echoing it back makes "turned off" look ignored.
      // Fall through and decide fresh instead.
      const hasStaleExecution = executedRules.some(
        (executedRule) => executedRule.rule && !executedRule.rule.enabled,
      );

      if (executedRules.length > 0 && !hasStaleExecution) {
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

      if (hasStaleExecution) {
        logger.info("Prior execution references a disabled rule, re-running");
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

      // A live rerun replaces the prior decision rather than stacking a new
      // ExecutedRule on top — otherwise reprocessing the same message over
      // and over grows the table unbounded (and the mail list has to page
      // through all of them). Test runs never persist, so skip them.
      if (rerun && !isTest) {
        await prisma.executedRule
          .deleteMany({ where: { emailAccountId, threadId, messageId } })
          .catch((error) => {
            logger.warn("Failed to clear prior executions before rerun", {
              error,
            });
          });
      }

      logger.info("Invoking runRules");
      // Same model tier as the live webhook (process-history-item), so
      // manual runs and the reprocess dialog's dry-run agree with what
      // automatic filing would actually do
      const result = await runRules({
        isTest,
        provider: emailProvider,
        message,
        rules,
        emailAccount,
        logger,
        modelType: "default",
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

      // Manual processing is the user asking "where does this belong NOW" —
      // folder labels stale rule runs applied earlier get cleaned up so the
      // answer and the mailbox agree
      if (!isTest) {
        await reconcileStaleFolderLabels({
          emailAccountId,
          emailProvider,
          threadId,
          results: result,
          logger,
        }).catch((error) => {
          logger.error("Stale folder label cleanup failed", { error });
        });
      }

      if (isTest) {
        await flushLoggerSafely(logger, {
          action: "runRules",
          flushReason: "test-mode",
        });
      }

      return result;
    },
  );

// The user confirmed the reprocess dialog's outcome, so the move is
// deterministic: drop the thread's other folder labels (the dialog listed
// them) regardless of how they got there, keep only the folder the current
// decision files into, and return to the inbox when nothing matched.
// Status labels re-apply on later runs via conversation tracking.
export const finalizeReprocessAction = actionClient
  .metadata({ name: "finalizeReprocess" })
  .inputSchema(finalizeReprocessBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { threadId, messageId, keepLabelName, returnToInbox },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });
      const labels = await emailProvider.getLabels();

      return finalizeReprocessOnThread({
        emailProvider,
        emailAccountId,
        labels,
        threadId,
        messageId,
        keepLabelName,
        returnToInbox,
        logger,
      });
    },
  );

// The move half of a reprocess: keep the chosen folder, strip the thread's
// other user labels, optionally return to the inbox, and record the
// correction. Shared by the single-thread dialog and the bulk runner so
// both apply the exact same deterministic outcome. Takes an already-created
// provider and pre-fetched labels so a bulk caller resolves them once.
export async function finalizeReprocessOnThread({
  emailProvider,
  emailAccountId,
  labels,
  threadId,
  messageId,
  keepLabelName,
  returnToInbox,
  logger,
}: {
  emailProvider: EmailProvider;
  emailAccountId: string;
  labels: Awaited<ReturnType<EmailProvider["getLabels"]>>;
  threadId: string;
  messageId: string;
  keepLabelName: string | null | undefined;
  returnToInbox: boolean;
  logger: Logger;
}) {
  const userLabels = labels.filter((label) => label.type === "user");
  const userLabelIds = new Set(userLabels.map((label) => label.id));
  // Normalized lookup: a raw compare here silently yields null on any
  // name-form mismatch, which makes the strip below remove the very
  // label the user asked to keep
  const keepLabelId = keepLabelName
    ? (findLabelByName({
        labels: userLabels,
        name: keepLabelName,
        getLabelName: (label) => label.name,
        normalize: normalizeLabelName,
      })?.id ?? null)
    : null;

  const messages = await emailProvider.getThreadMessages(threadId);
  const presentLabelIds = new Set(
    messages.flatMap((message) => message.labelIds ?? []),
  );
  // Reuse the sender from the messages we just fetched instead of
  // having the learning step fetch the message again
  const reprocessedMessage = messages.find(
    (message) => message.id === messageId,
  );
  const knownSender = reprocessedMessage
    ? extractEmailAddress(reprocessedMessage.headers.from)
    : null;

  const stripIds = [...presentLabelIds].filter(
    (id) => userLabelIds.has(id) && id !== keepLabelId,
  );
  if (stripIds.length) {
    // These strips echo back through the provider webhook looking like
    // user corrections — the authoritative learning happens below
    await suppressLabelLearning({
      emailAccountId,
      threadId,
      labelIds: stripIds,
      logger,
    });
    await emailProvider.removeThreadLabels(threadId, stripIds);
  }

  if (
    returnToInbox &&
    !presentLabelIds.has("INBOX") &&
    emailProvider.unarchiveThread
  ) {
    await emailProvider.unarchiveThread(threadId);
  }

  // The confirmed outcome is the strongest correction signal we get —
  // record it so filing improves. Never fail the move over it.
  await recordReprocessLearning({
    emailAccountId,
    provider: emailProvider,
    messageId,
    threadId,
    keepLabelId,
    strippedLabelIds: stripIds,
    knownSender,
    logger,
  }).catch((error) => {
    logger.error("Failed to record reprocess learning", { error });
  });

  logger.info("Finalized reprocess", {
    threadId,
    removed: stripIds.length,
    returnToInbox,
  });

  return { removed: stripIds.length };
}

// Reprocesses a selection of threads in a single request. Creates the
// provider, loads the enabled rules, and fetches the label list ONCE, then
// runs each thread (fresh decision + deterministic filing) with bounded
// concurrency — versus the old client loop that fired two serialized server
// actions per thread, each re-creating the provider and re-fetching labels.
export const bulkProcessThreadsAction = actionClient
  .metadata({ name: "bulkProcessThreads" })
  .inputSchema(bulkProcessThreadsBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { threadIds },
    }) => {
      if (!provider) throw new SafeError("Provider not found");

      const emailAccount = await getEmailAccountForRuleExecution({
        emailAccountId,
      });
      if (!emailAccount) throw new SafeError("Email account not found");

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      const [rules, labels] = await Promise.all([
        prisma.rule.findMany({
          where: { emailAccountId, enabled: true },
          include: { actions: true },
        }),
        emailProvider.getLabels(),
      ]);

      const results = await runWithBoundedConcurrency({
        items: threadIds,
        concurrency: 3,
        run: async (threadId) => {
          const messages = await emailProvider.getThreadMessages(threadId);
          // The latest message is the filing target, matching the webhook
          const message = messages.at(-1);
          if (!message) return;

          // A rerun replaces the prior decision instead of stacking a row
          await prisma.executedRule
            .deleteMany({
              where: { emailAccountId, threadId, messageId: message.id },
            })
            .catch((error) =>
              logger.warn("Failed to clear prior executions before rerun", {
                error,
              }),
            );

          const runResults = await runRules({
            isTest: false,
            provider: emailProvider,
            message,
            rules,
            emailAccount,
            logger,
            modelType: "default",
          });

          const folderName = getFolderNameFromResults(runResults, labels);
          await finalizeReprocessOnThread({
            emailProvider,
            emailAccountId,
            labels,
            threadId,
            messageId: message.id,
            keepLabelName: folderName,
            returnToInbox: !folderName,
            logger,
          });
        },
      });

      const failed = results.filter(
        (entry) => entry.result.status === "rejected",
      ).length;
      logger.info("Bulk processed threads", {
        total: threadIds.length,
        failed,
      });

      return { processed: threadIds.length - failed, failed };
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
          modelType: "default",
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

// Prior rule runs may have filed this thread into folders the current
// decision no longer supports (a since-fixed misroute, an edited rule).
// Strips those rule-applied labels — never labels the user added by hand,
// since only executed-rule history is consulted — and when nothing matches
// at all, returns the mail to the inbox where unmatched mail lives.
async function reconcileStaleFolderLabels({
  emailAccountId,
  emailProvider,
  threadId,
  results,
  logger,
}: {
  emailAccountId: string;
  emailProvider: EmailProvider;
  threadId: string;
  results: RunRulesResult[];
  logger: Logger;
}) {
  // What the current decision files into
  const currentLabelKeys = new Set<string>();
  for (const result of results) {
    for (const item of result.actionItems ?? []) {
      if (item.type !== ActionType.LABEL) continue;
      if (item.labelId) currentLabelKeys.add(item.labelId);
      if (item.label) currentLabelKeys.add(item.label.toLowerCase());
    }
  }

  const priorExecutions = await prisma.executedRule.findMany({
    where: {
      emailAccountId,
      threadId,
      status: ExecutedRuleStatus.APPLIED,
    },
    select: {
      actionItems: { select: { type: true, label: true, labelId: true } },
    },
  });
  const staleItems = priorExecutions
    .flatMap((executed) => executed.actionItems)
    .filter(
      (item) =>
        item.type === ActionType.LABEL &&
        !(item.labelId && currentLabelKeys.has(item.labelId)) &&
        !(item.label && currentLabelKeys.has(item.label.toLowerCase())),
    );
  if (!staleItems.length) return;

  // Only strip what's actually still on the thread
  const messages = await emailProvider.getThreadMessages(threadId);
  const presentLabelIds = new Set(
    messages.flatMap((message) => message.labelIds ?? []),
  );

  const staleLabelIds = new Set<string>();
  for (const item of staleItems) {
    const id =
      item.labelId ??
      (item.label
        ? ((await emailProvider.getLabelByName(item.label))?.id ?? null)
        : null);
    if (id && presentLabelIds.has(id) && !currentLabelKeys.has(id)) {
      staleLabelIds.add(id);
    }
  }
  if (!staleLabelIds.size) return;

  await suppressLabelLearning({
    emailAccountId,
    threadId,
    labelIds: [...staleLabelIds],
    logger,
  });
  await emailProvider.removeThreadLabels(threadId, [...staleLabelIds]);
  logger.info("Removed stale rule-applied folder labels", {
    removed: staleLabelIds.size,
  });

  const matchedAnyRule = results.some((result) => result.rule);
  if (
    !matchedAnyRule &&
    !presentLabelIds.has("INBOX") &&
    emailProvider.unarchiveThread
  ) {
    await emailProvider.unarchiveThread(threadId);
    logger.info("Restored thread to inbox after stale label cleanup");
  }
}

// The folder a run filed into: the LABEL action's resolved name, or null
// when nothing matched. Mirrors the reprocess dialog's resolution so the
// bulk path and the single-thread dialog agree.
function getFolderNameFromResults(
  results: RunRulesResult[],
  labels: Awaited<ReturnType<EmailProvider["getLabels"]>>,
): string | null {
  const matched = results.find((entry) => entry.rule);
  const labelItem = matched?.actionItems?.find(
    (item) => item.type === ActionType.LABEL,
  );
  if (!labelItem) return null;
  return (
    labelItem.label ??
    (labelItem.labelId
      ? (labels.find((label) => label.id === labelItem.labelId)?.name ?? null)
      : null)
  );
}
