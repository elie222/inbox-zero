import { randomUUID } from "node:crypto";
import { addDays } from "date-fns/addDays";
import { startOfDay } from "date-fns/startOfDay";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import { loadThreads } from "@/utils/threads/load";
import { runRulesForMessage } from "@/utils/ai/choose-rule/run-rules-for-message";
import { assertBulkRunAccess } from "@/utils/bulk-rules/access";
import {
  getAIApiCallError,
  isInvalidGrantError,
  SafeError,
} from "@/utils/error";
import { isProviderRateLimitModeError } from "@/utils/email/rate-limit-mode-error";
import { extractErrorInfo, isRetryableError } from "@/utils/gmail/retry";

const runnable = ["QUEUED", "SCANNING", "RUNNING"];
const leaseMs = 10 * 60_000;
const maxMessageAttempts = 3;

export async function processNextBulkRun(logger: Logger) {
  const now = new Date();
  await prisma.bulkRuleRun.updateMany({
    where: { status: "STOPPED", leaseUntil: { lt: now } },
    data: { activeAccountId: null, leaseToken: null, leaseUntil: null },
  });
  const available = { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] };
  const ready = {
    AND: [available, { OR: [{ retryAt: null }, { retryAt: { lte: now } }] }],
  };
  const run = await prisma.bulkRuleRun.findFirst({
    where: { status: { in: runnable }, ...ready },
    orderBy: { updatedAt: "asc" },
    include: {
      emailAccount: {
        select: {
          userId: true,
          account: { select: { provider: true, disconnectedAt: true } },
        },
      },
    },
  });
  if (!run) return { worked: false };
  const leaseToken = randomUUID();
  const claimed = await prisma.bulkRuleRun.updateMany({
    where: {
      id: run.id,
      updatedAt: run.updatedAt,
      status: { in: runnable },
      ...ready,
    },
    data: { leaseToken, leaseUntil: new Date(Date.now() + leaseMs) },
  });
  if (!claimed.count) return { worked: false };
  const log = logger.with({
    runId: run.id,
    emailAccountId: run.emailAccountId,
  });
  const heartbeat = setInterval(() => {
    prisma.bulkRuleRun
      .updateMany({
        where: { id: run.id, leaseToken },
        data: { leaseUntil: new Date(Date.now() + leaseMs) },
      })
      .catch((error) =>
        log.error("Could not extend bulk run lease", { error }),
      );
  }, 30_000);
  let checkingAccess = false;
  try {
    const interrupted = await prisma.bulkRuleRunItem.findFirst({
      where: { runId: run.id, status: "PROCESSING" },
    });
    if (interrupted) {
      const recorded = await prisma.executedRule.findFirst({
        where: {
          emailAccountId: run.emailAccountId,
          messageId: interrupted.messageId,
          createdAt: { gte: interrupted.updatedAt },
        },
        select: { id: true },
      });
      const retry = !recorded && interrupted.attempts < maxMessageAttempts;
      await prisma.bulkRuleRunItem.update({
        where: { id: interrupted.id },
        data: {
          status: retry ? "PENDING" : "FAILED",
          error: retry
            ? "Processing was interrupted. Retrying automatically."
            : "Processing was interrupted after actions may have started. Review this email; other emails will continue.",
        },
      });
      if (retry) await scheduleRetry(run, leaseToken);
      return { worked: true };
    }
    checkingAccess = true;
    if (run.emailAccount.account.disconnectedAt)
      throw new SafeError("Reconnect this email account to continue.");
    await assertBulkRunAccess(run.emailAccount.userId, run);
    checkingAccess = false;
    const status = await prisma.bulkRuleRun.findUnique({
      where: { id: run.id },
      select: { status: true },
    });
    if (!status || !runnable.includes(status.status)) return { worked: false };

    if (!run.scannedAt) {
      await prisma.bulkRuleRun.updateMany({
        where: { id: run.id, leaseToken, status: { in: runnable } },
        data: { status: "SCANNING" },
      });
      const provider = await createEmailProvider({
        emailAccountId: run.emailAccountId,
        provider: run.emailAccount.account.provider,
        logger: log,
      });
      const page = await loadThreads({
        emailAccountId: run.emailAccountId,
        emailProvider: provider,
        messageFormat: "metadata",
        query: {
          type: "inbox",
          limit: 100,
          after: run.startDate,
          before: run.endDate ? startOfDay(addDays(run.endDate, 1)) : undefined,
          isUnread: !run.includeRead,
          nextPageToken: run.nextPageToken,
        },
      });
      if (page.nextPageToken && page.nextPageToken === run.nextPageToken)
        throw new SafeError(
          "Mailbox pagination did not advance. Pause and try again.",
          400,
        );
      const existing = await prisma.bulkRuleRunItem.count({
        where: { runId: run.id },
      });
      const eligible = page.threads.filter(
        (thread) => run.rerun || !thread.plan,
      );
      const remaining =
        run.maxEmails === null
          ? eligible.length
          : Math.max(0, run.maxEmails - existing);
      const items = eligible.slice(0, remaining).flatMap((thread) => {
        const message = thread.messages.at(-1);
        return message
          ? [
              {
                runId: run.id,
                threadId: thread.id,
                messageId: message.id,
                subject: (
                  message.headers.subject ||
                  message.subject ||
                  "(No subject)"
                ).slice(0, 200),
                ruleNames: [] as string[],
              },
            ]
          : [];
      });
      // Save the discovered page and its cursor together so a restart cannot skip it.
      await prisma.$transaction([
        prisma.bulkRuleRunItem.createMany({
          data: items,
          skipDuplicates: true,
        }),
        prisma.bulkRuleRun.updateMany({
          where: { id: run.id, leaseToken },
          data: {
            nextPageToken: page.nextPageToken ?? null,
            retryAt: null,
            retryCount: 0,
            error: null,
            ...(!page.nextPageToken ||
            (run.maxEmails !== null && existing + items.length >= run.maxEmails)
              ? { scannedAt: new Date() }
              : {}),
          },
        }),
      ]);
      return { worked: true };
    }

    const item = await prisma.bulkRuleRunItem.findFirst({
      where: { runId: run.id, status: "PENDING" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (!item) {
      await prisma.bulkRuleRun.updateMany({
        where: { id: run.id, leaseToken, status: { in: runnable } },
        data: {
          status: "COMPLETED",
          activeAccountId: null,
          retryAt: null,
          retryCount: 0,
          error: null,
        },
      });
      return { worked: true };
    }
    await prisma.bulkRuleRun.updateMany({
      where: { id: run.id, leaseToken, status: { in: runnable } },
      data: { status: "RUNNING" },
    });
    // Pause/stop controls are checked before starting each email. In-flight work may finish.
    const current = await prisma.bulkRuleRun.findUnique({
      where: { id: run.id },
      select: { status: true },
    });
    if (!current || !runnable.includes(current.status))
      return { worked: false };
    const attemptStartedAt = new Date();
    await prisma.bulkRuleRunItem.update({
      where: { id: item.id },
      data: { status: "PROCESSING", attempts: { increment: 1 }, error: null },
    });
    try {
      const result = await runRulesForMessage({
        emailAccountId: run.emailAccountId,
        userId: run.emailAccount.userId,
        provider: run.emailAccount.account.provider,
        logger: log,
        messageId: item.messageId,
        threadId: item.threadId,
        rerun: run.rerun,
        isTest: false,
        skipDraftReplies: !run.generateDraftReplies,
        requireInbox: true,
      });
      if (
        result.some(
          (result) => result.status === "ERROR" || result.status === "APPLYING",
        )
      ) {
        await prisma.bulkRuleRunItem.update({
          where: { id: item.id },
          data: {
            status: "FAILED",
            error:
              "An email action did not complete. Review it before rerunning; other emails will continue.",
          },
        });
        return { worked: true };
      }
      await prisma.bulkRuleRunItem.update({
        where: { id: item.id },
        data: {
          status: result.length ? "COMPLETED" : "SKIPPED",
          ruleNames: [
            ...new Set(
              result.flatMap((result) =>
                result.rule ? [result.rule.name] : [],
              ),
            ),
          ],
        },
      });
      await prisma.bulkRuleRun.updateMany({
        where: { id: run.id, leaseToken, status: { in: runnable } },
        data: { retryAt: null, retryCount: 0, error: null },
      });
    } catch (error) {
      const message =
        error instanceof SafeError
          ? error.message
          : "This email could not be processed. Review it before rerunning.";
      const recorded = await prisma.executedRule.findFirst({
        where: {
          emailAccountId: run.emailAccountId,
          messageId: item.messageId,
          createdAt: { gte: attemptStartedAt },
        },
        select: { id: true },
      });
      const needsAttention = requiresAccountAttention(error);
      const retry = !recorded && item.attempts + 1 < maxMessageAttempts;
      await prisma.bulkRuleRunItem.update({
        where: { id: item.id },
        data: {
          status: !recorded && (retry || needsAttention) ? "PENDING" : "FAILED",
          error: message,
        },
      });
      if (needsAttention) throw error;
      if (retry) await scheduleRetry(run, leaseToken, error);
      log.warn("Bulk email attempt failed", { error, retry });
    }
    return { worked: true };
  } catch (error) {
    if (
      !(checkingAccess && error instanceof SafeError) &&
      !requiresAccountAttention(error)
    ) {
      log.warn("Bulk email processing will retry automatically", { error });
      await scheduleRetry(run, leaseToken, error);
      return { worked: true };
    }
    log.error("Bulk email processing requires attention", { error });
    await prisma.bulkRuleRun.updateMany({
      where: { id: run.id, leaseToken, status: { in: runnable } },
      data: {
        status: "PAUSED",
        retryAt: null,
        error:
          error instanceof SafeError
            ? error.message
            : "Processing paused after an error. Resume to continue with the remaining emails.",
      },
    });
    return { worked: true };
  } finally {
    clearInterval(heartbeat);
    await prisma.$transaction([
      prisma.bulkRuleRun.updateMany({
        where: { id: run.id, leaseToken, status: "STOPPED" },
        data: { activeAccountId: null },
      }),
      prisma.bulkRuleRun.updateMany({
        where: { id: run.id, leaseToken },
        data: { leaseToken: null, leaseUntil: null },
      }),
    ]);
  }
}

async function scheduleRetry(
  run: { id: string; retryCount: number },
  leaseToken: string,
  error?: unknown,
) {
  const delay = Math.min(
    30_000 * 2 ** Math.min(run.retryCount, 5),
    15 * 60_000,
  );
  const providerRetryAt =
    isProviderRateLimitModeError(error) && error.retryAt
      ? Date.parse(error.retryAt)
      : 0;
  const retryAt = new Date(
    Math.max(
      Date.now() + delay,
      Number.isFinite(providerRetryAt) ? providerRetryAt : 0,
    ),
  );
  await prisma.bulkRuleRun.updateMany({
    where: { id: run.id, leaseToken, status: { in: runnable } },
    data: {
      retryAt,
      retryCount: { increment: 1 },
      error:
        "A temporary error interrupted processing. Retrying automatically; completed emails are saved.",
    },
  });
}

function requiresAccountAttention(error: unknown) {
  const info = extractErrorInfo(error);
  if (isProviderRateLimitModeError(error) || isRetryableError(info).isRateLimit)
    return false;
  if (isInvalidGrantError(error)) return true;
  const status =
    getAIApiCallError(error)?.statusCode ??
    (error && typeof error === "object" && "statusCode" in error
      ? error.statusCode
      : info.status);
  return status === 400 || status === 401 || status === 403 || status === 422;
}
