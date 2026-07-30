import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { getPremiumUserFilter } from "@/utils/premium";
import {
  type FollowUpOutcome,
  processTaskFollowUp,
} from "@/utils/task-follow-up";

export const maxDuration = 300;

// One run's ceiling; anything beyond waits for the next hourly pass
const BATCH_SIZE = 50;

// Hourly chase loop: for every armed task whose next follow-up is due,
// either read the assignee's reply into the task or send the next check-in.
export const GET = withError("cron/task-follow-ups", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(
      new Error("Unauthorized request: api/cron/task-follow-ups"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await processDueTaskFollowUps(request.logger);
  return NextResponse.json(result);
});

export const POST = withError("cron/task-follow-ups", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/cron/task-follow-ups"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await processDueTaskFollowUps(request.logger);
  return NextResponse.json(result);
});

async function processDueTaskFollowUps(logger: Logger) {
  const now = new Date();

  const dueTasks = await prisma.task.findMany({
    where: {
      followUpEnabled: true,
      nextFollowUpAt: { lte: now },
      // A closed task never chases updates (updates enforce this too)
      status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] },
      assigneeEmail: { not: null },
      emailAccount: { ...getPremiumUserFilter() },
    },
    include: {
      subtasks: { select: { title: true, status: true } },
      emails: { orderBy: { createdAt: "desc" }, take: 20 },
      activity: { orderBy: { createdAt: "desc" }, take: 20 },
      emailAccount: {
        select: {
          id: true,
          name: true,
          account: { select: { provider: true } },
        },
      },
    },
    orderBy: { nextFollowUpAt: "asc" },
    take: BATCH_SIZE,
  });

  const counts: Record<FollowUpOutcome | "failed", number> = {
    replied: 0,
    sent: 0,
    paused: 0,
    failed: 0,
  };

  // Group by account so each provider client and AI config loads once
  const byAccount = new Map<string, typeof dueTasks>();
  for (const task of dueTasks) {
    const list = byAccount.get(task.emailAccountId) ?? [];
    list.push(task);
    byAccount.set(task.emailAccountId, list);
  }

  for (const [emailAccountId, tasks] of byAccount) {
    const accountLogger = logger.with({ emailAccountId });
    try {
      const emailAccount = await getEmailAccountWithAiAndTokens({
        emailAccountId,
      });
      if (!emailAccount) {
        accountLogger.warn("Skipping follow-ups: account not found");
        counts.failed += tasks.length;
        continue;
      }

      const provider = tasks[0].emailAccount.account.provider;
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger: accountLogger,
      });
      const senderName = tasks[0].emailAccount.name;

      for (const task of tasks) {
        try {
          const outcome = await processTaskFollowUp({
            task,
            emailAccount,
            emailProvider,
            senderName,
            logger: accountLogger,
            now,
          });
          counts[outcome] += 1;
        } catch (error) {
          counts.failed += 1;
          accountLogger.error("Task follow-up failed", {
            taskId: task.id,
            error,
          });
          captureException(error, {
            emailAccountId,
            extra: { taskId: task.id },
          });
        }
      }
    } catch (error) {
      counts.failed += tasks.length;
      accountLogger.error("Task follow-up account setup failed", { error });
      captureException(error, { emailAccountId });
    }
  }

  logger.info("Task follow-ups processed", { due: dueTasks.length, ...counts });
  return { due: dueTasks.length, ...counts };
}
