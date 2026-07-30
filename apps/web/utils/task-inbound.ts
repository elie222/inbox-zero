import type { Task, TaskActivity, TaskEmail } from "@/generated/prisma/client";
import type { EmailProvider } from "@/utils/email/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import { regenerateTaskOverview } from "@/utils/task-overview";
import { nextFollowUpFrom, type TaskEmailAttachment } from "@/utils/tasks";
import { extractEmailAddress, extractNameFromEmail } from "@/utils/email";
import { internalDateToDate } from "@/utils/date";
import prisma from "@/utils/prisma";

type TaskWithContext = Task & {
  subtasks: { title: string; status: Task["status"] }[];
  emails: TaskEmail[];
  activity: TaskActivity[];
};

const TASK_CONTEXT_INCLUDE = {
  subtasks: { select: { title: true, status: true } },
  emails: { orderBy: { createdAt: "desc" as const }, take: 20 },
  activity: { orderBy: { createdAt: "desc" as const }, take: 20 },
};

// Webhook-time task intake: a new inbound message whose thread is a task's
// chase thread — or any thread already linked to an open task — updates the
// task right away instead of waiting for the hourly poll.
export async function handleTaskInboundMessage({
  message,
  emailAccount,
  emailProvider,
  hasAiAccess,
  logger,
}: {
  message: ParsedMessage;
  emailAccount: EmailAccountWithAI;
  emailProvider: EmailProvider;
  hasAiAccess: boolean;
  logger: Logger;
}) {
  const threadId = message.threadId;
  if (!threadId) return;

  const tasks = await prisma.task.findMany({
    where: {
      emailAccountId: emailAccount.id,
      status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] },
      OR: [{ followUpThreadId: threadId }, { emails: { some: { threadId } } }],
    },
    include: TASK_CONTEXT_INCLUDE,
  });
  if (!tasks.length) return;

  for (const task of tasks) {
    try {
      await ingestInboundMessageForTask({
        task,
        message,
        emailAccount,
        emailProvider,
        // Linking and logging always happen; the overview rewrite is the
        // only part that needs the AI
        refreshOverview: hasAiAccess,
        logger,
      });
    } catch (error) {
      logger.error("Task inbound intake failed", { taskId: task.id, error });
    }
  }
}

// Reads one inbound message into one task: links it (with attachment
// metadata), logs it to the timeline, reschedules the chase when it's the
// assignee answering, and rewrites the AI overview. Idempotent per message.
export async function ingestInboundMessageForTask({
  task,
  message,
  emailAccount,
  emailProvider,
  refreshOverview = true,
  logger,
  now = new Date(),
}: {
  task: TaskWithContext;
  message: ParsedMessage;
  emailAccount: EmailAccountWithAI;
  emailProvider: EmailProvider;
  refreshOverview?: boolean;
  logger: Logger;
  now?: Date;
}): Promise<boolean> {
  const existing = await prisma.taskEmail.findUnique({
    where: { taskId_messageId: { taskId: task.id, messageId: message.id } },
    select: { id: true },
  });
  if (existing) return false;

  const fromName = extractNameFromEmail(message.headers.from);
  const fromAddress = extractEmailAddress(message.headers.from).toLowerCase();
  const isAssignee =
    !!task.assigneeEmail &&
    fromAddress === task.assigneeEmail.trim().toLowerCase();
  const snippet = (message.snippet ?? "").trim();
  const attachments = attachmentMetadata(message);

  const linked = await prisma.taskEmail.create({
    data: {
      taskId: task.id,
      threadId: message.threadId,
      messageId: message.id,
      from: fromName,
      subject: message.headers.subject || "(no subject)",
      snippet: snippet.slice(0, 500) || null,
      receivedAt: internalDateToDate(message.internalDate),
      ...(attachments.length && { attachments }),
    },
  });

  const quoted = snippet ? `: “${snippet.slice(0, 180)}”` : "";
  const attachmentNote = attachments.length
    ? ` (${attachments.length} attachment${attachments.length === 1 ? "" : "s"})`
    : "";
  await prisma.task.update({
    where: { id: task.id },
    data: {
      // The assignee answered this cycle; chase again a full cadence later
      ...(isAssignee &&
        task.followUpEnabled && {
          nextFollowUpAt: nextFollowUpFrom(task.followUpCadenceDays, now),
        }),
      activity: {
        create: {
          type: "REPLY_DETECTED",
          content: isAssignee
            ? `${fromName} replied${quoted}${attachmentNote}`
            : `New email from ${fromName}${quoted}${attachmentNote}`,
          threadId: message.threadId,
          messageId: message.id,
        },
      },
    },
  });

  if (refreshOverview) {
    try {
      await regenerateTaskOverview({
        task: { ...task, emails: [linked, ...task.emails] },
        emailAccount,
        emailProvider,
        logger,
        activityNote: isAssignee
          ? `AI overview updated from ${fromName}'s reply`
          : `AI overview updated from new email by ${fromName}`,
      });
    } catch (error) {
      // The email is already linked and logged; a failed summary just means
      // the overview lags until the next refresh
      logger.warn("Could not refresh overview from inbound email", {
        taskId: task.id,
        error,
      });
    }
  }

  logger.info("Inbound email read into task", { taskId: task.id });
  return true;
}

// The compact shape TaskEmail.attachments caches; bytes stay with the
// provider and download on demand
export function attachmentMetadata(
  message: Pick<ParsedMessage, "attachments">,
): TaskEmailAttachment[] {
  return (message.attachments ?? [])
    .filter((attachment) => attachment.attachmentId && attachment.filename)
    .map((attachment) => ({
      attachmentId: attachment.attachmentId,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
    }));
}
