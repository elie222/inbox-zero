"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import {
  addTaskNoteBody,
  bulkTasksBody,
  createTaskBody,
  deleteTaskBody,
  linkTaskEmailBody,
  refreshTaskOverviewBody,
  unlinkTaskEmailBody,
  updateTaskBody,
} from "@/utils/actions/task.validation";
import {
  isTaskOpen,
  nextFollowUpFrom,
  type TaskEmailAttachment,
} from "@/utils/tasks";
import { attachmentMetadata } from "@/utils/task-inbound";
import { regenerateTaskOverview } from "@/utils/task-overview";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { createEmailProvider } from "@/utils/email/provider";
import type { Prisma } from "@/generated/prisma/client";
import { TaskStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";

export const createTaskAction = actionClient
  .metadata({ name: "createTask" })
  .inputSchema(createTaskBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const now = new Date();
    const status = parsedInput.status ?? TaskStatus.TODO;
    const open = isTaskOpen(status);
    const assigneeEmail = normalizeAssignee(parsedInput.assigneeEmail);

    // Subtasks nest one level: a subtask can't become a parent itself
    if (parsedInput.parentId) {
      const parent = await prisma.task.findFirst({
        where: { id: parsedInput.parentId, emailAccountId },
        select: { parentId: true },
      });
      if (!parent) throw new SafeError("Parent task not found");
      if (parent.parentId) {
        throw new SafeError("Subtasks can't have their own subtasks");
      }
    }
    // A task created already closed is done on arrival: stamp completion and
    // never arm follow-up (mirrors the update path's close handling)
    const followUp = resolveFollowUp({
      followUpEnabled: open ? parsedInput.followUpEnabled : false,
      cadenceDays: parsedInput.followUpCadenceDays,
      assigneeEmail,
      now,
    });

    const task = await prisma.task.create({
      data: {
        emailAccountId,
        title: parsedInput.title.trim(),
        description: parsedInput.description?.trim() || null,
        status,
        ...(!open && { completedAt: now }),
        ...(parsedInput.priority && { priority: parsedInput.priority }),
        dueAt: parsedInput.dueAt ? new Date(parsedInput.dueAt) : null,
        assigneeEmail,
        parentId: parsedInput.parentId ?? null,
        sourceThreadId: parsedInput.sourceThreadId ?? null,
        sourceMessageId: parsedInput.sourceMessageId ?? null,
        ...followUp,
        activity: {
          create: { type: "CREATED", content: "Task created" },
        },
      },
    });

    return { task };
  });

export const updateTaskAction = actionClient
  .metadata({ name: "updateTask" })
  .inputSchema(updateTaskBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const existing = await prisma.task.findFirst({
      where: { id: parsedInput.id, emailAccountId },
    });
    if (!existing) throw new SafeError("Task not found");

    const now = new Date();
    const assigneeEmail =
      parsedInput.assigneeEmail !== undefined
        ? normalizeAssignee(parsedInput.assigneeEmail)
        : existing.assigneeEmail;

    // Follow-up needs an assignee; recompute the next run only when the
    // toggle, cadence, or assignee actually changes value. The detail form
    // always sends followUpEnabled/cadence even on an unrelated edit, so
    // compare against the stored row rather than mere presence — otherwise
    // every save would reset an unsent schedule to now + cadence.
    const wantsFollowUp =
      parsedInput.followUpEnabled ?? existing.followUpEnabled;
    const cadence =
      parsedInput.followUpCadenceDays ?? existing.followUpCadenceDays;
    const followUpChanged =
      (parsedInput.followUpEnabled !== undefined &&
        parsedInput.followUpEnabled !== existing.followUpEnabled) ||
      (parsedInput.followUpCadenceDays !== undefined &&
        parsedInput.followUpCadenceDays !== existing.followUpCadenceDays) ||
      (parsedInput.assigneeEmail !== undefined &&
        assigneeEmail !== existing.assigneeEmail);

    const statusChanged =
      parsedInput.status !== undefined &&
      parsedInput.status !== existing.status;
    const nowOpen = isTaskOpen(parsedInput.status ?? existing.status);

    const followUp = followUpChanged
      ? resolveFollowUp({
          followUpEnabled: wantsFollowUp,
          cadenceDays: cadence,
          assigneeEmail,
          now,
          lastFollowUpAt: existing.lastFollowUpAt,
        })
      : {};

    const data: Prisma.TaskUpdateInput = {
      ...(parsedInput.title !== undefined && {
        title: parsedInput.title.trim(),
      }),
      ...(parsedInput.description !== undefined && {
        description: parsedInput.description?.trim() || null,
      }),
      ...(parsedInput.status !== undefined && { status: parsedInput.status }),
      ...(parsedInput.priority !== undefined && {
        priority: parsedInput.priority,
      }),
      ...(parsedInput.dueAt !== undefined && {
        dueAt: parsedInput.dueAt ? new Date(parsedInput.dueAt) : null,
      }),
      ...(parsedInput.assigneeEmail !== undefined && { assigneeEmail }),
      ...followUp,
      // Stamp completion when moving into/out of a closed state
      ...(statusChanged && {
        completedAt: nowOpen ? null : now,
      }),
    };

    // A closed task never chases updates
    if (statusChanged && !nowOpen) {
      data.followUpEnabled = false;
      data.nextFollowUpAt = null;
    }

    const task = await prisma.task.update({
      where: { id: existing.id },
      data: {
        ...data,
        ...(statusChanged && {
          activity: {
            create: {
              type: "STATUS_CHANGE",
              content: `Status changed to ${parsedInput.status}`,
            },
          },
        }),
      },
    });

    return { task };
  });

export const deleteTaskAction = actionClient
  .metadata({ name: "deleteTask" })
  .inputSchema(deleteTaskBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    await prisma.task.deleteMany({ where: { id, emailAccountId } });
    return { deleted: true };
  });

export const addTaskNoteAction = actionClient
  .metadata({ name: "addTaskNote" })
  .inputSchema(addTaskNoteBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { taskId, content } }) => {
      const task = await prisma.task.findFirst({
        where: { id: taskId, emailAccountId },
        select: { id: true },
      });
      if (!task) throw new SafeError("Task not found");

      const activity = await prisma.taskActivity.create({
        data: { taskId, type: "NOTE", content: content.trim() },
      });

      return { activity };
    },
  );

export const linkTaskEmailAction = actionClient
  .metadata({ name: "linkTaskEmail" })
  .inputSchema(linkTaskEmailBody)
  .action(
    async ({ ctx: { emailAccountId, provider, logger }, parsedInput }) => {
      const task = await prisma.task.findFirst({
        where: { id: parsedInput.taskId, emailAccountId },
        select: { id: true },
      });
      if (!task) throw new SafeError("Task not found");

      // Linking the same message twice is a no-op, not a second log entry
      const existing = await prisma.taskEmail.findUnique({
        where: {
          taskId_messageId: {
            taskId: task.id,
            messageId: parsedInput.messageId,
          },
        },
      });
      if (existing) return { email: existing };

      // Snapshot attachment metadata from the real message; the client only
      // holds display fields. A fetch failure still links with those.
      let attachments: TaskEmailAttachment[] = [];
      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });
        const message = await emailProvider.getMessage(parsedInput.messageId);
        attachments = attachmentMetadata(message);
      } catch (error) {
        logger.warn("Could not read attachments for linked email", { error });
      }

      const subject = parsedInput.subject || "(no subject)";
      const email = await prisma.taskEmail.create({
        data: {
          taskId: task.id,
          threadId: parsedInput.threadId,
          messageId: parsedInput.messageId,
          from: parsedInput.from,
          subject,
          snippet: parsedInput.snippet?.trim() || null,
          receivedAt: parsedInput.receivedAt
            ? new Date(parsedInput.receivedAt)
            : null,
          ...(attachments.length && { attachments }),
        },
      });
      await prisma.taskActivity.create({
        data: {
          taskId: task.id,
          type: "NOTE",
          content: `Linked email “${subject}”`,
          threadId: parsedInput.threadId,
          messageId: parsedInput.messageId,
        },
      });

      return { email };
    },
  );

export const unlinkTaskEmailAction = actionClient
  .metadata({ name: "unlinkTaskEmail" })
  .inputSchema(unlinkTaskEmailBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    await prisma.taskEmail.deleteMany({
      where: { id, task: { emailAccountId } },
    });
    return { deleted: true };
  });

export const bulkTasksAction = actionClient
  .metadata({ name: "bulkTasks" })
  .inputSchema(bulkTasksBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { ids, op } }) => {
    const tasks = await prisma.task.findMany({
      where: { id: { in: ids }, emailAccountId },
      select: { id: true, status: true, assigneeEmail: true },
    });
    if (!tasks.length) return { affected: 0 };

    const now = new Date();

    if (op === "delete") {
      await prisma.task.deleteMany({
        where: { id: { in: tasks.map((task) => task.id) }, emailAccountId },
      });
      return { affected: tasks.length };
    }

    if (op === "done") {
      const openTasks = tasks.filter((task) => isTaskOpen(task.status));
      await prisma.task.updateMany({
        where: { id: { in: openTasks.map((task) => task.id) } },
        data: {
          status: TaskStatus.DONE,
          completedAt: now,
          // A closed task never chases updates
          followUpEnabled: false,
          nextFollowUpAt: null,
        },
      });
      await prisma.taskActivity.createMany({
        data: openTasks.map((task) => ({
          taskId: task.id,
          type: "STATUS_CHANGE" as const,
          content: "Status changed to DONE",
        })),
      });
      return { affected: openTasks.length };
    }

    // Nudge: pull the next AI follow-up forward to now for every selected
    // open task that has someone to chase
    const nudgeable = tasks.filter(
      (task) => isTaskOpen(task.status) && task.assigneeEmail,
    );
    await prisma.task.updateMany({
      where: { id: { in: nudgeable.map((task) => task.id) } },
      data: { followUpEnabled: true, nextFollowUpAt: now },
    });
    await prisma.taskActivity.createMany({
      data: nudgeable.map((task) => ({
        taskId: task.id,
        type: "NOTE" as const,
        content: `Nudge requested — next AI follow-up to ${task.assigneeEmail} moved up to now`,
      })),
    });
    return { affected: nudgeable.length };
  });

// Rebuilds the AI overview on demand from everything linked to the task
export const refreshTaskOverviewAction = actionClient
  .metadata({ name: "refreshTaskOverview" })
  .inputSchema(refreshTaskOverviewBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { id },
    }) => {
      const task = await prisma.task.findFirst({
        where: { id, emailAccountId },
        include: {
          subtasks: { select: { title: true, status: true } },
          emails: { orderBy: { createdAt: "desc" }, take: 20 },
          activity: { orderBy: { createdAt: "desc" }, take: 20 },
        },
      });
      if (!task) throw new SafeError("Task not found");

      if (
        !task.emails.length &&
        !task.subtasks.length &&
        !task.activity.length
      ) {
        throw new SafeError(
          "Nothing to build an overview from yet — link emails or add notes first.",
        );
      }

      const emailAccount = await getEmailAccountWithAiAndTokens({
        emailAccountId,
      });
      if (!emailAccount) throw new SafeError("Email account not found");

      const emailProvider = task.emails.length
        ? await createEmailProvider({ emailAccountId, provider, logger })
        : null;

      const overview = await regenerateTaskOverview({
        task,
        emailAccount,
        emailProvider,
        logger,
      });
      if (!overview) throw new SafeError("Could not generate an overview");

      return { aiStatusSummary: overview };
    },
  );

function normalizeAssignee(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email || null;
}

// Follow-up can only be armed with an assignee to chase; arming it schedules
// the first run one cadence out from the last one (or now)
function resolveFollowUp({
  followUpEnabled,
  cadenceDays,
  assigneeEmail,
  now,
  lastFollowUpAt,
}: {
  followUpEnabled: boolean | undefined;
  cadenceDays: number | undefined;
  assigneeEmail: string | null;
  now: Date;
  lastFollowUpAt?: Date | null;
}): {
  followUpEnabled: boolean;
  followUpCadenceDays?: number;
  nextFollowUpAt: Date | null;
} {
  const cadence = cadenceDays ?? 3;
  const enabled = !!followUpEnabled && !!assigneeEmail;
  return {
    followUpEnabled: enabled,
    ...(cadenceDays !== undefined && { followUpCadenceDays: cadence }),
    nextFollowUpAt: enabled
      ? nextFollowUpFrom(cadence, lastFollowUpAt ?? now)
      : null,
  };
}
