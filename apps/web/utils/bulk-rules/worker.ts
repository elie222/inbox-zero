import { randomUUID } from "node:crypto";
import { addDays } from "date-fns/addDays";
import { startOfDay } from "date-fns/startOfDay";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import { loadThreads } from "@/utils/threads/load";
import { runRulesForMessage } from "@/utils/ai/choose-rule/run-rules-for-message";
import { assertBulkRunAccess } from "@/utils/bulk-rules/access";
import { SafeError } from "@/utils/error";

const runnable = ["QUEUED", "SCANNING", "RUNNING"];
const leaseMs = 10 * 60_000;

export async function processNextBulkRun(logger: Logger) {
  const now = new Date();
  await prisma.bulkRuleRun.updateMany({
    where: { status: "STOPPED", leaseUntil: { lt: now } },
    data: { activeAccountId: null, leaseToken: null, leaseUntil: null },
  });
  const available = { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] };
  const run = await prisma.bulkRuleRun.findFirst({
    where: { status: { in: runnable }, ...available },
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
      ...available,
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
  try {
    const interrupted = await prisma.bulkRuleRunItem.findFirst({
      where: { runId: run.id, status: "PROCESSING" },
    });
    if (interrupted) {
      const error =
        "Processing was interrupted. Review the last email; resume will continue with the remaining emails.";
      await prisma.bulkRuleRunItem.update({
        where: { id: interrupted.id },
        data: { status: "FAILED", error },
      });
      await prisma.bulkRuleRun.updateMany({
        where: { id: run.id, leaseToken, status: { in: runnable } },
        data: { status: "PAUSED", error },
      });
      return { worked: true };
    }
    if (run.emailAccount.account.disconnectedAt)
      throw new SafeError("Reconnect this email account to continue.");
    await assertBulkRunAccess(run.emailAccount.userId, run);
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
        data: { status: "COMPLETED", activeAccountId: null },
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
    await prisma.bulkRuleRunItem.update({
      where: { id: item.id },
      data: { status: "PROCESSING" },
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
      )
        throw new SafeError(
          "An email action did not complete. Review it before rerunning.",
        );
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
    } catch (error) {
      const message =
        error instanceof SafeError
          ? error.message
          : "This email could not be processed. Review it before rerunning.";
      await prisma.bulkRuleRunItem.update({
        where: { id: item.id },
        data: { status: "FAILED", error: message },
      });
      throw error;
    }
    return { worked: true };
  } catch (error) {
    log.error("Bulk email processing paused", { error });
    await prisma.bulkRuleRun.updateMany({
      where: { id: run.id, leaseToken, status: { in: runnable } },
      data: {
        status: "PAUSED",
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
