"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import {
  addTaskNoteBody,
  createTaskBody,
  deleteTaskBody,
  updateTaskBody,
} from "@/utils/actions/task.validation";
import { isTaskOpen, nextFollowUpFrom } from "@/utils/tasks";
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
