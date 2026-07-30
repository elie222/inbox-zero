import type { Task, TaskActivity, TaskEmail } from "@/generated/prisma/client";
import type { EmailProvider } from "@/utils/email/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import { aiDraftTaskFollowUpEmail } from "@/utils/ai/tasks/draft-follow-up-email";
import { regenerateTaskOverview } from "@/utils/task-overview";
import { nextFollowUpFrom } from "@/utils/tasks";
import { extractEmailAddress, extractNameFromEmail } from "@/utils/email";
import { internalDateToDate } from "@/utils/date";
import { escapeHtml } from "@/utils/string";
import prisma from "@/utils/prisma";

export type TaskForFollowUp = Task & {
  subtasks: { title: string; status: Task["status"] }[];
  emails: TaskEmail[];
  activity: TaskActivity[];
};

export type FollowUpOutcome = "replied" | "sent" | "paused";

// One due task's turn in the chase loop: if the assignee replied since the
// last follow-up, read the reply into the task and hold off; otherwise send
// the next check-in on the same thread.
export async function processTaskFollowUp({
  task,
  emailAccount,
  emailProvider,
  senderName,
  logger,
  now = new Date(),
}: {
  task: TaskForFollowUp;
  emailAccount: EmailAccountWithAI;
  emailProvider: EmailProvider;
  senderName: string | null;
  logger: Logger;
  now?: Date;
}): Promise<FollowUpOutcome> {
  const assigneeEmail = task.assigneeEmail?.trim().toLowerCase();

  // Chasing yourself by email is noise — disarm rather than rescan hourly
  if (!assigneeEmail || assigneeEmail === emailAccount.email.toLowerCase()) {
    await prisma.task.update({
      where: { id: task.id },
      data: {
        followUpEnabled: false,
        nextFollowUpAt: null,
        activity: {
          create: {
            type: "NOTE",
            content: "AI follow-up paused — this task has no one to chase",
          },
        },
      },
    });
    return "paused";
  }

  // A reply since the last follow-up answers the chase: read it into the
  // task instead of sending another email on top of it
  const threadMessages =
    task.followUpThreadId && task.lastFollowUpAt
      ? await emailProvider.getThreadMessages(task.followUpThreadId)
      : [];
  const reply = findAssigneeReply({
    messages: threadMessages,
    assigneeEmail,
    since: task.lastFollowUpAt,
  });

  if (reply && task.followUpThreadId) {
    await recordAssigneeReply({
      task,
      reply,
      threadId: task.followUpThreadId,
      emailAccount,
      emailProvider,
      logger,
      now,
    });
    return "replied";
  }

  const body = await draftFollowUpBody({
    task,
    assigneeEmail,
    senderName,
    emailAccount,
    logger,
  });

  let threadId = task.followUpThreadId;
  if (threadId && threadMessages.length) {
    // Continue the existing chase thread so context and replies stay together
    const lastMessage = threadMessages.at(-1);
    const lastSubject = lastMessage?.headers.subject ?? followUpSubject(task);
    await emailProvider.sendEmailWithHtml({
      replyToEmail: {
        threadId,
        headerMessageId: lastMessage?.headers["message-id"] ?? "",
        references: lastMessage?.headers.references,
        messageId: lastMessage?.id,
      },
      to: assigneeEmail,
      subject: /^re:/i.test(lastSubject) ? lastSubject : `Re: ${lastSubject}`,
      messageHtml: toHtmlParagraphs(body),
    });
  } else {
    const sent = await emailProvider.sendEmailWithHtml({
      to: assigneeEmail,
      subject: followUpSubject(task),
      messageHtml: toHtmlParagraphs(body),
    });
    threadId = sent.threadId;
  }

  await prisma.task.update({
    where: { id: task.id },
    data: {
      followUpThreadId: threadId,
      lastFollowUpAt: now,
      nextFollowUpAt: nextFollowUpFrom(task.followUpCadenceDays, now),
      followUpCount: { increment: 1 },
      activity: {
        create: {
          type: "FOLLOW_UP_SENT",
          content: `AI follow-up sent to ${assigneeEmail}`,
          threadId,
        },
      },
    },
  });

  logger.info("Task follow-up sent", { taskId: task.id });
  return "sent";
}

// The newest message from the assignee since the last follow-up went out
export function findAssigneeReply({
  messages,
  assigneeEmail,
  since,
}: {
  messages: ParsedMessage[];
  assigneeEmail: string;
  since: Date | null;
}): ParsedMessage | undefined {
  if (!since) return;
  const assignee = assigneeEmail.toLowerCase();
  return messages
    .filter(
      (message) =>
        extractEmailAddress(message.headers.from).toLowerCase() === assignee,
    )
    .filter(
      (message) =>
        internalDateToDate(message.internalDate, {
          fallbackToNow: false,
        }).getTime() > since.getTime(),
    )
    .at(-1);
}

async function recordAssigneeReply({
  task,
  reply,
  threadId,
  emailAccount,
  emailProvider,
  logger,
  now,
}: {
  task: TaskForFollowUp;
  reply: ParsedMessage;
  threadId: string;
  emailAccount: EmailAccountWithAI;
  emailProvider: EmailProvider;
  logger: Logger;
  now: Date;
}) {
  const fromName = extractNameFromEmail(reply.headers.from);
  const snippet = (reply.snippet ?? "").trim();

  // The reply becomes a linked email, so the Emails tab shows it and every
  // future overview reads it
  const linked = await prisma.taskEmail.upsert({
    where: {
      taskId_messageId: { taskId: task.id, messageId: reply.id },
    },
    update: {},
    create: {
      taskId: task.id,
      threadId,
      messageId: reply.id,
      from: fromName,
      subject: reply.headers.subject || "(no subject)",
      snippet: snippet.slice(0, 500) || null,
      receivedAt: internalDateToDate(reply.internalDate),
    },
  });

  await prisma.task.update({
    where: { id: task.id },
    data: {
      // The reply answered this cycle; chase again a full cadence later
      nextFollowUpAt: nextFollowUpFrom(task.followUpCadenceDays, now),
      activity: {
        create: {
          type: "REPLY_DETECTED",
          content: snippet
            ? `${fromName} replied: “${snippet.slice(0, 180)}”`
            : `${fromName} replied`,
          threadId,
          messageId: reply.id,
        },
      },
    },
  });

  try {
    await regenerateTaskOverview({
      task: {
        ...task,
        emails: [
          linked,
          ...task.emails.filter((email) => email.id !== linked.id),
        ],
      },
      emailAccount,
      emailProvider,
      logger,
      activityNote: `AI overview updated from ${fromName}'s reply`,
    });
  } catch (error) {
    // The reply is already recorded; a failed summary just means the
    // overview lags until the next refresh
    logger.warn("Could not refresh overview from reply", {
      taskId: task.id,
      error,
    });
  }

  logger.info("Task follow-up reply detected", { taskId: task.id });
}

async function draftFollowUpBody({
  task,
  assigneeEmail,
  senderName,
  emailAccount,
  logger,
}: {
  task: TaskForFollowUp;
  assigneeEmail: string;
  senderName: string | null;
  emailAccount: EmailAccountWithAI;
  logger: Logger;
}): Promise<string> {
  try {
    const draft = await aiDraftTaskFollowUpEmail({
      emailAccount,
      task,
      assigneeEmail,
      senderName,
      recentActivity: task.activity.slice(0, 10),
    });
    if (draft?.body.trim()) return draft.body.trim();
  } catch (error) {
    logger.warn("AI follow-up draft failed, using fallback", {
      taskId: task.id,
      error,
    });
  }
  // The chase must not stall on a drafting hiccup
  return `Hi,\n\nJust checking in on "${task.title}" — could you send a quick status update when you get a chance?\n\nThanks${senderName ? `,\n${senderName}` : "!"}`;
}

function followUpSubject(task: Pick<Task, "title">) {
  return `Checking in: ${task.title}`;
}

// Minimal plain-text → HTML for the outgoing email body
export function toHtmlParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p>${escapeHtml(paragraph.trim()).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
}
