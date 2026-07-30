"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { formatDistanceToNow } from "date-fns";
import { SparklesIcon, Trash2Icon } from "lucide-react";
import {
  isTaskOverdue,
  type TaskListItem,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
} from "@/utils/tasks";
import { TaskPriority, type TaskStatus } from "@/generated/prisma/enums";
import type { TasksResponse } from "@/app/api/tasks/route";
import {
  addTaskNoteAction,
  deleteTaskAction,
  updateTaskAction,
} from "@/utils/actions/task";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toDatetimeLocal } from "./datetime";

const PRIORITIES: TaskPriority[] = [
  TaskPriority.LOW,
  TaskPriority.NORMAL,
  TaskPriority.HIGH,
  TaskPriority.URGENT,
];

export function TaskDetail({
  task,
  mutate,
  onDeleted,
}: {
  task: TaskListItem & {
    activity?: TasksResponse["tasks"][number]["activity"];
  };
  mutate: () => void;
  onDeleted?: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [followUpEnabled, setFollowUpEnabled] = useState(task.followUpEnabled);

  const { register, handleSubmit, watch } = useForm<{
    title: string;
    description: string;
    assigneeEmail: string;
    dueAt: string;
    followUpCadenceDays: number;
  }>({
    defaultValues: {
      title: task.title,
      description: task.description ?? "",
      assigneeEmail: task.assigneeEmail ?? "",
      dueAt: toDatetimeLocal(task.dueAt),
      followUpCadenceDays: task.followUpCadenceDays,
    },
  });

  const assignee = watch("assigneeEmail");

  const update = useAction(updateTaskAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Task saved" });
      mutate();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const del = useAction(deleteTaskAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Task deleted" });
      mutate();
      onDeleted?.();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const overdue = isTaskOverdue(task);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 break-words font-display text-2xl leading-7 tracking-tight">
            {task.title}
          </h2>
          <Button
            variant="destructiveSoft"
            size="iconSm"
            loading={del.isExecuting}
            onClick={() => {
              if (confirm("Delete this task?")) del.execute({ id: task.id });
            }}
          >
            <span className="sr-only">Delete task</span>
            <Trash2Icon className="size-4" />
          </Button>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {task.assigneeEmail ? (
            <span className="break-all">Assigned to {task.assigneeEmail}</span>
          ) : (
            <span>Yours</span>
          )}
          {task.dueAt && (
            <span className={overdue ? "text-red-500" : undefined}>
              Due{" "}
              {formatDistanceToNow(new Date(task.dueAt), { addSuffix: true })}
            </span>
          )}
          {overdue && <Badge color="red">Overdue</Badge>}
        </div>
      </div>

      {task.aiStatusSummary && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
            <SparklesIcon className="size-3 text-primary" />
            AI status
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {task.aiStatusSummary}
          </p>
        </div>
      )}

      <form
        className="space-y-4"
        onSubmit={handleSubmit((values) =>
          update.execute({
            id: task.id,
            title: values.title,
            description: values.description,
            status,
            priority,
            assigneeEmail: values.assigneeEmail,
            dueAt: values.dueAt ? new Date(values.dueAt).toISOString() : null,
            followUpEnabled,
            // A cleared number input is NaN; omit it so it keeps the
            // stored cadence rather than failing the whole save
            followUpCadenceDays: Number.isFinite(values.followUpCadenceDays)
              ? Number(values.followUpCadenceDays)
              : undefined,
          }),
        )}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as TaskStatus)}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUS_ORDER.map((value) => (
                  <SelectItem key={value} value={value}>
                    {TASK_STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Priority</Label>
            <Select
              value={priority}
              onValueChange={(value) => setPriority(value as TaskPriority)}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value.charAt(0) + value.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="task-title">Title</Label>
          <Input id="task-title" className="mt-2" {...register("title")} />
        </div>
        <div>
          <Label htmlFor="task-description">Description</Label>
          <Textarea
            id="task-description"
            className="mt-2"
            rows={3}
            {...register("description")}
          />
        </div>
        {/* An email input and a datetime-local don't fit side by side on a
            phone; stack them there */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="task-assignee">Assignee email</Label>
            <Input
              id="task-assignee"
              type="email"
              className="mt-2"
              placeholder="who@company.com"
              {...register("assigneeEmail")}
            />
          </div>
          <div>
            <Label htmlFor="task-due">Due</Label>
            <Input
              id="task-due"
              type="datetime-local"
              className="mt-2"
              {...register("dueAt")}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="task-followup">AI follow-up</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                The AI emails the assignee for updates and reads their replies.
              </p>
            </div>
            <Switch
              id="task-followup"
              checked={followUpEnabled}
              disabled={!assignee.trim()}
              onCheckedChange={setFollowUpEnabled}
            />
          </div>
          {followUpEnabled && (
            <div className="mt-3">
              <Label htmlFor="task-cadence">Every N days</Label>
              <Input
                id="task-cadence"
                type="number"
                min={1}
                max={90}
                className="mt-2 w-24"
                {...register("followUpCadenceDays", { valueAsNumber: true })}
              />
              {task.nextFollowUpAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Next follow-up{" "}
                  {formatDistanceToNow(new Date(task.nextFollowUpAt), {
                    addSuffix: true,
                  })}{" "}
                  · {task.followUpCount} sent
                </p>
              )}
            </div>
          )}
          {!assignee.trim() && (
            <p className="mt-2 text-xs text-muted-foreground">
              Add an assignee email to enable follow-up.
            </p>
          )}
        </div>

        <Button type="submit" size="sm" loading={update.isExecuting}>
          Save
        </Button>
      </form>

      <TaskActivityFeed task={task} mutate={mutate} />
    </div>
  );
}

function TaskActivityFeed({
  task,
  mutate,
}: {
  task: TaskListItem & {
    activity?: TasksResponse["tasks"][number]["activity"];
  };
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [note, setNote] = useState("");
  const activity = task.activity ?? [];

  const addNote = useAction(addTaskNoteAction.bind(null, emailAccountId), {
    onSuccess: () => {
      setNote("");
      mutate();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  return (
    <div>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
        Activity
      </h3>
      <div className="flex gap-2">
        <Input
          value={note}
          placeholder="Add a note…"
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && note.trim() && !addNote.isExecuting) {
              addNote.execute({ taskId: task.id, content: note });
            }
          }}
        />
        <Button
          variant="outline"
          size="sm"
          loading={addNote.isExecuting}
          disabled={!note.trim()}
          onClick={() => addNote.execute({ taskId: task.id, content: note })}
        >
          Add
        </Button>
      </div>
      <ul className="mt-3 space-y-2">
        {activity.map((entry) => (
          <li key={entry.id} className="flex gap-2 text-sm">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
            <div className="min-w-0">
              <p className="text-foreground">{entry.content}</p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(entry.createdAt), {
                  addSuffix: true,
                })}
              </p>
            </div>
          </li>
        ))}
        {!activity.length && (
          <li className="text-sm text-muted-foreground">No activity yet.</li>
        )}
      </ul>
    </div>
  );
}
